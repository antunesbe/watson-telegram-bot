var express = require('express');
var TelegramBot = require('node-telegram-bot-api');
var watson = require('watson-developer-cloud');
var request = require('request');
var fs = require('fs');
var cfenv = require('cfenv');
var db = require('./routes/db');
var Cloudant = require('cloudant');
var config = require('./config/config.json');

var cloudant = Cloudant(config.credentials.cloudant.url);


// get the app environment from Cloud Foundry
var appEnv = cfenv.getAppEnv();

var token = appEnv.isLocal?config.telegram_token:process.env.TELEGRAM_TOKEN;

var app = express();
app.use(express.static(__dirname + '/public'));

var speech_to_text = watson.speech_to_text(config.credentials.speech_to_text);

var paramsstt = {
  content_type: 'audio/ogg;codecs=opus',
  continuous: true,
  interim_results: false
};

var text_to_speech = watson.text_to_speech(config.credentials.text_to_speech);

var language_translation = watson.language_translation(config.credentials.language_translation);

var visual_recognition = watson.visual_recognition(config.credentials.visual_recognition);

var conversation = watson.conversation(config.credentials.conversation);


var bot = new TelegramBot(token, {polling: true});
var dbCredentials = {
  'db': 'dialog_history'
};

var dbCloudant = cloudant.use(dbCredentials.db);
var models_list = [];
models_list['portuguese'] = {
    'name': 'Brazilian Portuguese',
    'model': 'pt-BR_BroadbandModel',
    'voice':'pt-BR_IsabelaVoice',
    'initials': 'pt-br',
    'workspace': config.workspace.portuguese
  };
models_list['english'] = {
    'name': 'US English',
    'model': 'en-US_BroadbandModel',
    'voice': 'en-US_MichaelVoice',
    'initials': 'en',
    'workspace': config.workspace.english
};
var language_list = [];
language_list['pt'] = 'portuguese';
language_list['en'] = 'english';
language_list['pt-br'] = 'portuguese';

var usersPreferences = [];
bot.on('message', function(msg){
  console.log("Message Received");
  if(typeof usersPreferences[msg.from.id] == 'undefined'){
    usersPreferences[msg.from.id] = {
      '_id': msg.from.id.toString(),
      'myLanguage': 'english',
      'targetLanguage': 'portuguese',
      'context': {},
      'message': ''
    };
    dbCloudant.get(msg.from.id.toString(),{"include_docs": true}, function(err,body){
      if(!err){
        //TODO: save user properties
        usersPreferences[msg.from.id] = {
          '_id': msg.from.id.toString(),
          'myLanguage': 'english',
          'targetLanguage': 'portuguese',
          'context': {},
          'messages': []
        }
      }
      else{
        user = {
          '_id': msg.from.id.toString(),
          'messages': []
        };
        db.addChat(user);
      }
    });
  }
  if(msg['voice']){
    return onVoiceMessage(msg);
  }else if( msg['photo']){
    return onImageMessage(msg);
  }else{
    if(msg.text.toLowerCase() != "/help" && msg.text.toLowerCase() !=  "/settings" && msg.text.toLowerCase() !=  "/start"){
      language_translation.identify({ text: msg.text },
        function (err, language) {
          if (err)
            console.log('error:', err);
          else{
            var languageIdentified = language.languages[0].language;
            if(languageIdentified != 'en' && languageIdentified != 'pt-br' && languageIdentified != 'pt'){
              var flag = false;
                for(x in language.languages){
                  if(language.languages[x].language == 'en' || language.languages[x].language == 'pt-br' || language.languages[x].language == 'pt'){
                    languageIdentified = language.languages[x].language;
                    flag=true;
                    break;
                  }
                }
              if(!flag){
                bot.sendMessage(msg.chat.id, "Sorry. Can you repeat in other words?");
              }
            }
            usersPreferences[msg.from.id].myLanguage = language_list[languageIdentified];
            for(x in models_list){
              if(usersPreferences[msg.from.id].myLanguage != x){
                usersPreferences[msg.from.id].targetLanguage = x;
                break;
              }
            }
            console.log("Language: " + languageIdentified);
            sendMessageToWatson(msg,msg.text, languageIdentified);
          }
      });
    }
  }

  var user = {};
});

function addToDatabase(messages){
  db.appendMessage(messages);
}

function sendMessageToWatson(msg,text,language){
    var messages = [];
    var watson_workspace_id = models_list[usersPreferences[msg.from.id].myLanguage].workspace;
    var user = {
      '_id': msg.from.id.toString(),
      'message': {
        'sender': "user",
        'message': msg.text,
        'time': new Date().getTime()
      }
    };
    messages.push(user);
    if(typeof usersPreferences[msg.from.id] == 'undefined'){
      setTimeout(function(){
        alert("Hello");
      }, 3000);
    }
    conversation.message({input: {text: text}, context: usersPreferences[msg.from.id].context, workspace_id: watson_workspace_id}, function(err, response) {
       if (err) {
         console.error(err);
       } else {
         if(response.intents[0].intent == "translate" || response.intents[0].intent == "mylanguage" || usersPreferences[msg.from.id].lastCommand != null){
            if(typeof response.entities[0] == 'undefined'){
              usersPreferences[msg.from.id].lastCommand = response.intents[0].intent;
            }else{
              if(response.intents[0].intent == "mylanguage" || usersPreferences[msg.from.id].lastCommand == 'mylanguage'){
                usersPreferences[msg.from.id].myLanguage = response.entities[0].value;
                for(x in models_list){
                  if(usersPreferences[msg.from.id].myLanguage != x){
                    usersPreferences[msg.from.id].targetLanguage = x;
                    break;
                  }
                }
                usersPreferences[msg.from.id].lastCommand = null;
              }else if(response.intents[0].intent == "translate" || usersPreferences[msg.from.id].lastCommand == 'translate'){
                usersPreferences[msg.from.id].targetLanguage = response.entities[0].value;
                for(x in models_list){
                  if(usersPreferences[msg.from.id].targetLanguage != x){
                    usersPreferences[msg.from.id].myLanguage = x;
                    break;
                  }
                }
                usersPreferences[msg.from.id].lastCommand = null;
              }
            }
         }
         usersPreferences[msg.from.id].context.conversation_id = response.context.conversation_id;
         usersPreferences[msg.from.id].context.system = response.context.system;

         var watsonAnswer = response.output.text[0];
         if(watsonAnswer == null){
           watsonAnswer = "I can translate voice messages and recognize photos";
         }
         bot.sendMessage(msg.chat.id, watsonAnswer);

       }

    });
}

function translateAndSendMessage(userId,chatId,watsonAnswer, language, messages){
   var answer = watsonAnswer;
  if(language != 'english'){
    language_translation.translate({text: watsonAnswer, source : 'en', target: language },
      function (err, translation) {
        if (err)
          console.log('error:', err);
        else{
          answer = translation.translations[0].translation;
          bot.sendMessage(chatId, answer);
        }
      }
    );
  }else{
    bot.sendMessage(chatId, answer);
  }
  var watson = {
    '_id': userId,
    'message': {
      'sender': "watson",
      'message': answer,
      'time': new Date().getTime()
    }
  };
  messages.push(watson);
  addToDatabase(messages);
}

function onImageMessage(msg){
  var chatId = msg.chat.id;
  var fileId = msg.photo[1].file_id;
  bot.downloadFile(fileId,'./images').then(function(callback){
    var paramsvr = {
      images_file: fs.createReadStream(callback)
    };
    visual_recognition.classify(paramsvr, function(err, res) {
      if (err)
        console.log(err);
      else{
        var messages = [];
        var message ='I recognized as ';
        for( x in res.images[0].classifiers[0].classes){
          message = message + res.images[0].classifiers[0].classes[x].class;
          if(x == (res.images[0].classifiers[0].classes.length-1)){
            message = message +".";
          }else{
            message = message +", ";
          }
        }
        if(usersPreferences[msg.from.id].myLanguage != "english"){
          language_translation.translate({text: message, source : 'en', target: usersPreferences[msg.from.id].myLanguage },
            function (err, translation) {
              if (err)
                console.log('error:', err);
              else{
                message = translation.translations[0].translation;
                var watson = {
                  '_id': msg.from.id.toString(),
                  'message': {
                    'sender': "watson",
                    'message': message,
                    'time': new Date().getTime()
                  }
                };
                messages.push(watson);
                addToDatabase(messages);
                bot.sendMessage(chatId, message).then(function(){
                fs.unlinkSync(callback);
                });
              }
            }
          );
        }else{
          var watson = {
            '_id': msg.from.id.toString(),
            'message': {
              'sender': "watson",
              'message': message,
              'time': new Date().getTime()
            }
          };
          messages.push(watson);
          addToDatabase(messages);
          bot.sendMessage(chatId, message).then(function(){
          fs.unlinkSync(callback);
          });
        }

      }
    });
  });
}

//commands
bot.onText(/\/start/, function (msg) {
  var chatId = msg.chat.id;
  dbCloudant.get(msg.from.id.toString(),{"include_docs": true}, function(err,body){
    if(err){
      var user = {
        '_id': msg.from.id.toString(),
        'messages': []
      };
      db.addChat(user);
    }
  });
});

bot.onText(/\/help/, function (msg) {
  sendHelp(msg);
});

bot.onText(/\/ajuda/, function (msg) {
  sendHelp(msg);
});

function sendHelp(msg){
  var chatId = msg.chat.id;
  var messages = [];
  var user = {
    '_id': msg.from.id.toString(),
    'message': {
      'sender': "user",
      'message': msg.text,
      'time': new Date().getTime()
    }
  };
  messages.push(user);
  var message = "Send a voice message to translate\nor\nSend a photo to recognize\n\nCommands:\n/settings - Settings.\n/help - Get help.";

  translateAndSendMessage(msg.from.id.toString(),chatId,message, usersPreferences[msg.from.id].myLanguage,messages);
}

bot.onText(/\/settings/, function (msg) {
  sendSettings(msg);
});

function sendSettings(msg){
  var chatId = msg.chat.id;
  var messages = [];
  var user = {
    '_id': msg.from.id.toString(),
    'message': {
      'sender': "user",
      'message': msg.text,
      'time': new Date().getTime()
    }
  };
  messages.push(user);
  var message = "Your preferences:\nYour Language: " + models_list[usersPreferences[msg.from.id].myLanguage].name +
                "\nTranslate to: " + models_list[usersPreferences[msg.from.id].targetLanguage].name;
  translateAndSendMessage(msg.from.id.toString(),chatId,message, usersPreferences[msg.from.id].myLanguage, messages);
}

function onVoiceMessage(msg){
  var chatId = msg.chat.id;
  var modelSTT;
  var myLanguage;
  var targetLanguage;
  var targetVoice;

  modelSTT = models_list[usersPreferences[msg.from.id].myLanguage].model;
  myLanguage = models_list[usersPreferences[msg.from.id].myLanguage].initials;
  targetLanguage = models_list[usersPreferences[msg.from.id].targetLanguage].initials;
  targetVoice = models_list[usersPreferences[msg.from.id].targetLanguage].voice;

  var paramsstt = {
    content_type: 'audio/ogg;codecs=opus',
    continuous: true,
    interim_results: false,
    model: modelSTT
  };

  bot.getFileLink(msg.voice.file_id).then(function(link){
    var recognizeStream = speech_to_text.createRecognizeStream(paramsstt);
    recognizeStream.setEncoding('utf8');
  	recognizeStream.on('results', function(data){
      if(data && data.results && data.results.length>0 && data.results[0].alternatives && data.results[0].alternatives.length>0){
        var result = data.results[0].alternatives[0].transcript;
        var filePath = './voices/'+msg.date+'.ogg';
        var messages = [];
        var user = {
          '_id': msg.from.id.toString(),
          'message': {
            'sender': "watson",
            'message': "Speech to text: " + result,
            'time': new Date().getTime()
          }
        };
        messages.push(user)
        addToDatabase(messages);
        if(myLanguage != 'en' && targetLanguage != 'en'){
          language_translation.translate({text: result, source : myLanguage, target: 'en'}, function(err,resultTranslate){
            if(err)
              console.log("error: " +err);
            else{
              myLanguage = 'en';
              result = resultTranslate.translations[0].translation;

              sendMessages(msg, result, myLanguage, targetLanguage,targetVoice);
            }
          });
        }else{
            sendMessages(msg, result, myLanguage, targetLanguage,targetVoice);
        }
      }
    });
    ['data', 'error', 'connection-close'].forEach(function(eventName){
	    recognizeStream.on(eventName, console.log.bind(console, eventName + ' event: '));
	   });
    request(link).pipe(recognizeStream);
  });
}

function sendMessages(msg, result, myLanguage, targetLanguage,targetVoice){
  var chatId = msg.chat.id;
  var filePath = './voices/'+msg.date+'.ogg';
  language_translation.translate({text: result, source : myLanguage, target: targetLanguage}, function (err, result) {
    if (err)
      console.log('error:', err);
    else{
      var translation = result.translations[0].translation;
      console.log("translated: " + translation);
      var paramstts = {
        text: translation,
        voice: targetVoice
      };
      var voiceFile = text_to_speech.synthesize(paramstts).pipe(fs.createWriteStream(filePath));
      voiceFile.on('close',function(){
        bot.sendAudio(chatId, filePath).then(function(error,result){
          fs.unlinkSync(filePath);
          console.log("Send Audio");
        });
      });
      var messages = [];
      var watson = {
        '_id': msg.from.id.toString(),
        'message': {
          'sender': "watson",
          'message': "translated: " + translation,
          'time': new Date().getTime()
        }
      };
      messages.push(watson)
      addToDatabase(messages);
      bot.sendMessage(chatId, translation, {disable_notification: true, reply_to_message_id: msg.message_id}).then(function () {
        console.log("Send Message");

      });
    }
  });
};

app.listen(appEnv.port, '0.0.0.0', function() {
  console.log("server starting on " + appEnv.url);
});
