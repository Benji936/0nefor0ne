import requests
import json
import wget
import os

directory = "./Cards"
onready_cards = os.listdir(directory)



request = requests.get("https://db.ygoprodeck.com/api/v7/cardinfo.php")
cards = json.loads(request.content)
#print(cards.keys())
for card in cards["data"]:
    #print(card["card_images"][0]["image_url"])
    
    url = card["card_images"][0]["image_url"]
    name = url.split("/")[-1]
    final_path = "./Cards/"+name
    if name not in onready_cards:
        print(name)
        wget.download(url,name)

