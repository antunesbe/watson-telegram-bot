var Cloudant = require('cloudant');
var config = require('../config/config.json');

var cloudant = Cloudant(config.credentials.cloudant.url);

exports.addChat = function(req,res){
	db = cloudant.use('dialog_history');
  db.insert(req, function(err, data) {
		if(!err){
			return data;
		} else {
	    console.log("Error:", err);
			return false;
		}
  });
};

exports.appendMessage = function(req,res){
	db = cloudant.use('dialog_history');

	db.get(req[0]._id, {"include_docs": true}, function(err,data){
		if(!err){
			var length = req.length;
			for(x in req){
				data.messages.push(req[x].message);
			}
			db.insert(data, function(err, data) {
				if(!err){
					return data;
				} else {
					console.log("Error:", err);
					return false;
				}
			});
		} else {
			console.log("Error2:", err);
			return false;
		}
	});
};


exports.getChat = function(req,res,next){
  db = cloudant.use('chats');

  db.get(req,{"include_docs": true}, function(err,body){
		if(!err){
			console.log("body: " + JSON.stringify(body));
			res.send('true');
		}
		else{
			console.log("err1: " + err);
			return false;
		}
  });
};
