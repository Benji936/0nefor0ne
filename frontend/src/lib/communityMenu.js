// Resolves where the profile menu's "My community" item navigates, from the
// slugs of communities the signed-in user owns. Pure — unit-tested.
//   []            -> null                (hide the item)
//   [slug]        -> that community's profile
//   [slug, ...]   -> the Account "My communities" list
export function communityMenuTarget(slugs, locale = "en") {
  if (!Array.isArray(slugs) || slugs.length === 0) return null;
  if (slugs.length === 1) {
    return { name: "communityProfile", params: { locale, slug: slugs[0] } };
  }
  return { name: "account", params: { locale } };
}
