# Vision

Build a proof of concept of a bot at the app Telegram app using Watson's TTS and STT services.

Runtime: Node.js https://www.npmjs.com/package/node-telegram-bot-api

Follow this tutorial to start: https://medium.com/chat-bots/building-an-ibm-watson-powered-ai-chatbot-9635290fb1d3


# Bluemix env

* Org: alanbraz@br.ibm.com
* Space: cognia
* App: cognia-telegram-bot
* URL: http://cognia-telegram-bot.mybluemix.net/
* Services
  * Speech To Text
  * Text to Speech
  * Language Translation
  * Visual Recognition
  * Conversation
  * Cloudant

# Telegram bot

## How to use the bot at Telegram

* Open a conversation with @WatsonDemonstrationBot
* Talk to him
* Send a voice message
* Send a photo
* Use /help to get all commands

## Commands
```
help - Get help
settings - Get your preferences
```

## Telegram bot config PROD

* Bot name: @WatsonDemonstrationBot


## How to setup dev environment

* Clone the git project to your computer
* npm install
* npm install nodemon
* nodemon
