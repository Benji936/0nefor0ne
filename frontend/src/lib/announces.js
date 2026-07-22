import { getClient } from "@/lib/supabaseClient";
import { ANNOUNCE_TTL_DAYS } from "@/lib/announceExpiry";

/**
 * Fetch all active announces, joined with the seller's Trader profile and their images.
 *
 * Expired listings are hidden from everyone except their own owner, who keeps
 * seeing them (badged, and renewable) in the "My Announces" row. Filtering at
 * read time rather than flipping a status column means expiry cannot silently
 * stop working because a scheduled job did not run.
 *
 * @returns {Promise<Array>}
 */
export async function fetchAnnounces() {
  const me = (await getClient().auth.getSession()).data?.session?.user?.id ?? null;

  // Client clock, not server clock. The window is 30 days, so a few minutes of
  // skew is immaterial, and using the same clock here and in the UI's
  // isExpired() keeps the list and the badges consistent with each other.
  const nowIso = new Date().toISOString();

  // 1. Fetch announces and images
  let query = getClient()
    .from("announce")
    .select(`
      *,
      images:announce_image(id, url, sort_order)
    `)
    .eq("status", "active");

  query = me
    ? query.or(`expires_at.gt.${nowIso},seller.eq.${me}`)
    : query.gt("expires_at", nowIso);

  const { data: announceData, error } = await query
    .order("created_at", { ascending: false });

  if (error) {
    console.error("fetchAnnounces failed", error);
    throw error;
  }

  const announces = announceData ?? [];
  if (announces.length === 0) return [];

  // 2. Fetch seller profiles
  const sellerIds = [...new Set(announces.map(a => a.seller))];
  const { data: traderData, error: traderError } = await getClient()
    .from("Trader")
    .select("id, Name, City, Country, avatar_url")
    .in("id", sellerIds);

  if (traderError) {
    console.error("fetchAnnounces (traders) failed", traderError);
  }
  
  const tradersById = Object.fromEntries((traderData ?? []).map(t => [t.id, t]));

  // 3. Combine and sort images
  return announces.map(a => {
    a.Trader = tradersById[a.seller] || {};
    a.images = (a.images ?? []).sort((img1, img2) => img1.sort_order - img2.sort_order);
    return a;
  });


}

/**
 * Fetch announces for the current user (all statuses).
 * @returns {Promise<Array>}
 */
export async function fetchMyAnnounces() {
  const me = (await getClient().auth.getSession()).data?.session?.user?.id;
  if (!me) return [];

  const { data, error } = await getClient()
    .from("announce")
    .select(`
      *,
      images:announce_image(id, url, sort_order)
    `)
    .eq("seller", me)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("fetchMyAnnounces failed", error);
    throw error;
  }

  return (data ?? []).map(a => {
    a.images = (a.images ?? []).sort((img1, img2) => img1.sort_order - img2.sort_order);
    return a;
  });
}

/**
 * Create a new announce and upload its images.
 *
 * Takes an options object rather than positional args: with kind/archetype/
 * wantDetail added there would be nine positional parameters, most of them
 * optional, which is impossible to call safely.
 *
 * @param {object}   opts
 * @param {string}   opts.title
 * @param {string}   [opts.description='']
 * @param {number|null} [opts.price=null]     null on a Looking For post with no budget
 * @param {string}   [opts.currency='EUR']
 * @param {File[]}   [opts.imageFiles=[]]
 * @param {{ ygo_card_id: number, card_name: string, extension: string, rarity: string }|null} [opts.card=null]
 * @param {'sell'|'looking_for'} [opts.kind='sell']
 * @param {string|null} [opts.archetype=null]
 * @param {string|null} [opts.wantDetail=null]
 * @returns {Promise<number>} the new announce id
 */
export async function createAnnounce({
  title,
  description = '',
  price = null,
  currency = 'EUR',
  imageFiles = [],
  card = null,
  kind = 'sell',
  archetype = null,
  wantDetail = null,
} = {}) {
  const me = (await getClient().auth.getSession()).data?.session?.user?.id;
  if (!me) throw new Error("Not authenticated");

  // 1. Insert announce record
  const { data: announceData, error: announceError } = await getClient()
    .from("announce")
    .insert({
      seller: me,
      title,
      description,
      price,
      currency,
      status: 'active',
      kind,
      archetype:   archetype  || null,
      want_detail: wantDetail || null,
      ygo_card_id: card?.ygo_card_id ?? null,
      card_name:   card?.card_name   ?? null,
    })
    .select('id')
    .single();

  if (announceError) throw announceError;
  const announceId = announceData.id;

  // 1b. If a card was specified, add it to the seller's trade list.
  //     Only for sell posts: a Looking For card belongs on the wish list, and
  //     announcing a want should never silently list it as tradeable.
  if (card?.ygo_card_id && kind === 'sell') {
    await getClient()
      .from('Card')
      .insert({
        trader:    me,
        name:      card.card_name,
        image_id:  card.ygo_card_id,
        extension: card.extension ?? '',
        rarity:    card.rarity    ?? 'common',
        wish:      false,
        status:    'active',
        quantity:  1,
        game:      'YGO',
      });
    // We intentionally ignore errors here — failing to add to trade list
    // should never block the announce from being created.
  }

  // 2. Upload images and create records
  if (imageFiles && imageFiles.length > 0) {
    await Promise.all(imageFiles.map((file, index) =>
      uploadAnnounceImage(announceId, me, file, index)
    ));
  }

  return announceId;
}

/**
 * Upload new images to an existing announce (used by the edit flow).
 * @param {number} announceId
 * @param {File[]} files
 * @param {number} startSortOrder  sort_order to assign the first new image
 */
export async function addAnnounceImages(announceId, files, startSortOrder = 0) {
  if (!files || files.length === 0) return;
  const me = (await getClient().auth.getSession()).data?.session?.user?.id;
  if (!me) throw new Error("Not authenticated");
  await Promise.all(
    files.map((file, i) => uploadAnnounceImage(announceId, me, file, startSortOrder + i))
  );
}

/**
 * Delete a single announce image: removes the DB row and best-effort removes
 * the underlying storage object (parsed from its public URL).
 * @param {number} imageId  announce_image.id
 * @param {string} url      the image's public URL
 */
export async function deleteAnnounceImage(imageId, url) {
  const { error } = await getClient()
    .from("announce_image")
    .delete()
    .eq("id", imageId);
  if (error) throw error;

  // Best-effort storage cleanup — never fatal to the edit.
  try {
    const marker = "/announce-images/";
    const idx = (url ?? "").indexOf(marker);
    if (idx !== -1) {
      const path = url.slice(idx + marker.length);
      await getClient().storage.from("announce-images").remove([path]);
    }
  } catch (err) {
    console.warn("announce image storage cleanup failed", err);
  }
}

/**
 * Upload an image to the announce-images storage bucket and link to announce.
 */
async function uploadAnnounceImage(announceId, uploaderId, file, sortOrder) {
  const ext  = file.name.split(".").pop() ?? "jpg";
  const path = `${announceId}/${uploaderId}/${Date.now()}_${sortOrder}.${ext}`;

  // Upload to storage
  const { error: storageError } = await getClient()
    .storage.from("announce-images")
    .upload(path, file, { contentType: file.type, upsert: false });
  
  if (storageError) {
    console.error("Storage upload failed for image", storageError);
    throw storageError;
  }

  // Get public URL
  const { data: urlData } = getClient()
    .storage.from("announce-images")
    .getPublicUrl(path);

  // Insert DB record
  const { error: dbError } = await getClient()
    .from("announce_image")
    .insert({ 
      announce: announceId, 
      uploader: uploaderId, 
      url: urlData.publicUrl,
      sort_order: sortOrder
    });
    
  if (dbError) throw dbError;
}

/**
 * Update an existing announce.
 */
export async function updateAnnounce(id, fields) {
  const { error } = await getClient()
    .from("announce")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", id);
    
  if (error) throw error;
}

/**
 * Give an announce a fresh visibility window.
 *
 * The value sent is deliberate but not trusted: the announce_expiry_guard
 * trigger rewrites any write to expires_at as exactly now() + the standard
 * window, so the server decides the real date. We send the date we expect so
 * the intent is readable, and re-read it below so the caller's local copy
 * matches what actually landed.
 *
 * @param {number} id
 * @returns {Promise<string>} the new expires_at, as stored
 */
export async function renewAnnounce(id) {
  const intended = new Date(Date.now() + ANNOUNCE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await getClient()
    .from("announce")
    .update({ expires_at: intended, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("expires_at")
    .single();

  if (error) throw error;
  return data.expires_at;
}

/**
 * Delete an announce. Note: the images will be deleted from announce_image
 * due to CASCADE, but we should theoretically also delete them from storage.
 * For now, we rely on the DB cascade for the records.
 */
export async function deleteAnnounce(id) {
  const { error } = await getClient()
    .from("announce")
    .delete()
    .eq("id", id);
    
  if (error) throw error;
}
