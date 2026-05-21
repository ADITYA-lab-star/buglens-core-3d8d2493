import requests
r = requests.get('https://generativelanguage.googleapis.com/v1beta/models?key=AIzaSyCNeoAEuihL7w1FSKq2RyHGlP8HSDCq8VE')
print([m['name'] for m in r.json().get('models', [])])
