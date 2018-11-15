const express = require('express');
const cors = require('cors');
const webpush = require('web-push');
const AWS = require('aws-sdk');
const app = express();
const moment = require('moment');
const accountSid = 'ACf330804c8b7d0b3e1247499b7e1bd23e';
const authToken = '9fa4d1a423c180b8be00c5e5ae56af15';
const client = require('twilio')(accountSid, authToken);
const publicVapidKey = process.env.PUBLIC_VAPID_KEY;
const privateVapidKey = process.env.PRIVATE_VAPID_KEY;
const emailid = process.env.EMAIL_ID;
const fs = require('fs');
app.use(cors())
app.use(require('body-parser').json());
webpush.setVapidDetails('mailto:'+emailid, publicVapidKey, privateVapidKey);

const accessKeyID = process.env.ACCESS_KEY_ID;
const secretAccessKey = process.env.SECRET_ACCESS_KEY;
const region = process.env.REGION;
var documentClient = new AWS.DynamoDB.DocumentClient({accessKeyId: accessKeyID, secretAccessKey: secretAccessKey, region: region, apiVersion: '2012-10-08'});
var ses = new AWS.SES({accessKeyId: accessKeyID, secretAccessKey: secretAccessKey, region: 'eu-west-1', apiVersion: '2010-12-01'});
var active = process.env. ACTIVE_DAYS || 60;
var fairlyActive = process.env. FAIRLY_ACTIVE_DAYS || 180;

function createCampaignId() {
    var text = "";
    var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

    for (var i = 0; i < 10; i++)
        text += possible.charAt(Math.floor(Math.random() * possible.length));

    return text;
}

app.get('/useractivity', (req, res) => {
    var params = {
        TableName : "usertable",
    };
    documentClient.scan(params, function(err, data) {
        if (err) {
            console.log(err);
            res.status(400).json({status: 400, message: 'error in fetching data'});
        } else {
          var currentTime = moment();
          var activeUserCount = 0;
          var inactiveUserCount = 0;
          var highlyInactive = 0;
          var mediumInactive = 0;
          var lowInactive = 0;
          data.Items.forEach(function(element, index, array) {
            var lastLogin = moment(element["last_login"],'DD/MM/YYYY');
            var dateDiff = 0;
            if(lastLogin) {
                dateDiff = currentTime.diff(lastLogin, 'days');
            }
            if(dateDiff <= active) {
                activeUserCount++;
            } else {
                inactiveUserCount++;
                if(dateDiff>=60 && dateDiff<=150 ){
                    lowInactive++;
                }else if(dateDiff>=150 && dateDiff<=180){
                    mediumInactive++;
                }else if(dateDiff>=180){
                    highlyInactive++;
                }
            }
            });
          var totalCount = activeUserCount + inactiveUserCount;
          res.status(201).json({status: 200, data: { 
            totalCount: totalCount, 
            activeUserCount: activeUserCount, 
            inactiveUserCount: inactiveUserCount,
            inactiveArray: [lowInactive,
                mediumInactive,
                highlyInactive
            ]
            }
          });
        }
      });
});

app.get('/getcampaigndetails', (req, res) => {
    var params = {
        TableName: 'campaigntable'
    };
    documentClient.scan(params, function(err, data) {
        if (err) {
            console.log(err);
            res.status(400).json({status: 400, message: 'error in fetching data'});
        } else {
            var successfullCampaign = 0;
            var successfullChannels = {
                "whatsapp": 0,
                "email": 0,
                "webpush": 0
            };
            var failedCampaign = 0;
            var failedChannels = {
                "whatsapp": 0,
                "email": 0,
                "webpush": 0
            };
            data.Items.forEach(function(element, index, array) {
                if(element["status"] == 0) {
                    successfullCampaign++;
                    successfullChannels[element["channel"]] = successfullChannels[element["channel"]] + 1;
                } else {
                    failedCampaign++;
                    failedChannels[element["channel"]] = failedChannels[element["channel"]] + 1;
                }
            });
            var totalCampaigns = successfullCampaign + failedCampaign;
            res.status(201).json({status: 200, data: { 
                    totalCampaigns: totalCampaigns,
                    successfullCampaign: {count: successfullCampaign, split: successfullChannels}, 
                    failedCampaigned: {count: failedCampaign, split: failedChannels}
                }
            });
        }
    });
});

app.get('/getcampaigndetails/:status/:channel', (req, res) => {
    var params;
    if(req.params.status == "success") {
        params = {
            TableName: 'campaigntable',
            IndexName: 'channel-index',
            KeyConditionExpression: '#channel = :channel',
            FilterExpression: "#status = :status",
            ExpressionAttributeNames: {
                '#status': 'status',
                '#channel': 'channel'
            },
            ExpressionAttributeValues: {
                ':status': 1,
                ':channel': req.params.channel
            }
        };
    } else {
        params = {
            TableName: 'campaigntable',
            IndexName: 'channel-index',
            KeyConditionExpression: '#channel = :channel',
            FilterExpression: "#status = :status",
            ExpressionAttributeNames: {
                '#status': 'status',
                '#channel': 'channel'
            },
            ExpressionAttributeValues: {
                ':status': 0,
                ':channel': req.params.channel
            }
        };
    }
    documentClient.query(params, function(err, data) {
        if (err) {
            console.log(err);
            res.status(400).json({status: 400, message: 'error in fetching data'});
        } else {
            var userID = [];
            data.Items.forEach(function(element, index, array) {
                userID.push(element["userid"]);
            });
            var userIDObject = {};
            var index = 0;
            userID.forEach(function(value) {
                index++;
                var userIDKey = ":userid"+index;
                userIDObject[userIDKey.toString()] = value;
            });

            var params = {
                TableName : "usertable",
                FilterExpression : "id IN ("+Object.keys(userIDObject).toString()+ ")",
                ExpressionAttributeValues : userIDObject
            };
            
            documentClient.scan(params, function(err, data) {
                if(err) {
                    res.status(400).json({status: 400, message: 'error in fetching data'});
                } else {
                    res.status(201).json({status: 200, userlist: data.Items});
                }
            });
        }
     });
});

app.get('/updatecampaign/:campaignid', (req, res) => {
    var updateParams = {
        TableName: 'campaigntable',
        Key: { campaignid : req.params.campaignid },
        UpdateExpression: 'set #status = :status',
        ConditionExpression: '#campaignid = :campaignid',
        ExpressionAttributeNames: {'#campaignid': 'campaignid', '#status' : 'status'},
        ExpressionAttributeValues: {
            ':campaignid': req.params.campaignid,
            ':status' : 1
        }
    };
    documentClient.update(updateParams, function(err, data) {
        if(err) {
            res.status(400).json({status: 400, message: 'error in fetching data'});
        } else {
            res.status(201).json({status: 200, message: "Campaign details updated"});
        }
    });
});

app.get('/logo/:campaignid', (req, res) => {
    if(req.params.campaignid) {
        var updateParams = {
            TableName: 'campaigntable',
            Key: { campaignid : req.params.campaignid },
            UpdateExpression: 'set #status = :status',
            ExpressionAttributeNames: {'#status' : 'status'},
            ExpressionAttributeValues: {
                ':status' : 1
            }
        };
        documentClient.update(updateParams, function(err, data) {
            if(err) {
                //console.log(err);
            } else {
                //console.log(data);
            }
        });
    }
    var img = fs.readFileSync('./logo.png');
    res.writeHead(200, {'Content-Type': 'image/png' });
    res.end(img, 'binary');
});

app.get('/resetcampaign', (req, res) => {
    var params = {
        TableName: 'usertable',
        IndexName: 'is_actual_user-index',
        KeyConditionExpression: '#is_actual_user = :is_actual_user',
        ExpressionAttributeNames: {
            '#is_actual_user': 'is_actual_user'
        },
        ExpressionAttributeValues: {
            ':is_actual_user': 1
        }
    };
    documentClient.query(params, function(err, data) {
        if (err) {
            res.status(400).json({status: 400, message: 'error in fetching data'});
        } else {
            var userID = [];
            data.Items.forEach(function(element, index, array) {
                userID.push(element["id"]);
            });
            var userIDObject = {};
            var index = 0;
            userID.forEach(function(value) {
                index++;
                var userIDKey = ":userid"+index;
                userIDObject[userIDKey.toString()] = value;
            });
            
            var params = {
                TableName : "campaigntable",
                FilterExpression : "userid IN ("+Object.keys(userIDObject).toString()+ ")",
                ExpressionAttributeValues : userIDObject
            };
            
            documentClient.scan(params, function(err, data) {
                if(err) {
                    res.status(400).json({status: 400, message: 'error in fetching data'});
                } else {
                    var campaignids = [];
                    data.Items.forEach(function(element, index, array) {
                        campaignids.push(
                        {
                            DeleteRequest : {
                                Key : {
                                    'campaignid' : element["campaignid"]   
                                }
                            }
                        });
                    });
                    if(campaignids.length > 0) {
                        var deleteParams = {
                            RequestItems : {
                                'campaigntable' : campaignids
                            }
                        };
                        documentClient.batchWrite(deleteParams, function(err, data) {
                            if (err) {
                                res.status(400).json({status: 400, message: 'error in fetching data'});
                            } else {
                                res.status(201).json({status: 200, message: "Reseted campaign for actual users"});
                            }
                        });
                    } else {
                        res.status(201).json({status: 200, message: "No campaigns to reset"});
                    }
                }
            });

        }
    });
});

app.post('/subscribe', (req, res) => {
    const subscription = req.body;
    var params = {
      TableName: 'webpush',
      Item: subscription
    };
  
    documentClient.put(params, function(err, data) {
      if (err) console.log(err);
      else console.log(data);
      res.status(201).json({});
    });
    
  });

app.get('/getloyalitydetails', (req, res) => {
    var params = {
        TableName: "usertable",
    };
    documentClient.scan(params, function (err, data) {
        if (err) {
            console.log(err);
            res.status(400).json({ status: 400, message: 'error in fetching data' });
        } else {
            var no_of_bookings = 5,
                daysBooked = 10,
                currentTime = moment(),
                activeUserCount = 0,
                inactiveUserCount = 0,
                LoyalityCustomerList = [];
            data.Items.forEach(function (element, index, array) {
                var lastLogin = moment(element["last_login"], 'DD/MM/YYYY'),
                    dateDiff = 0,
                    numBook = element["no_of_bookings"],
                    daysBook = element["days_booked"];
                if (lastLogin) {
                    dateDiff = currentTime.diff(lastLogin, 'days');
                }
                if (dateDiff <= active) {
                    if (numBook >= no_of_bookings && daysBook >= daysBooked) {
                        LoyalityCustomerList.push(element);
                    }

                }
            });
            res.status(201).json({
                status: 200, data: {
                    count: LoyalityCustomerList.length,
                    userlist: LoyalityCustomerList
                }
            });
        }
    });
});

app.post('/triggercampaign', (req, res) => {
    var channel = req.body.channel;
    var template = req.body.template == "birthday" ? req.body.template : "normal";
    if(channel == "email" || channel == "whatsapp" || channel == "webpush") {
        var params = {
            TableName: 'usertable',
            IndexName: 'is_actual_user-index',
            KeyConditionExpression: '#is_actual_user = :is_actual_user',
            ExpressionAttributeNames: {
                '#is_actual_user': 'is_actual_user'
            },
            ExpressionAttributeValues: {
                ':is_actual_user': 1
            }
        };
        documentClient.query(params, function(err, data) {
            if (err) {
                res.status(400).json({status: 400, message: 'error in fetching actual users'});
            } else {
                res.status(200).json({status: 200, message: 'Campaign triggered'});
                data.Items.forEach(function(element, index, array) {
                    var campaignID = createCampaignId();
                    if(channel == "email") {
                        sendEmail(campaignID,  element["first_name"], element["email"]);
                    } else if(channel == "webpush") {
                        sendWebpush(campaignID);
                    } else if(channel == "whatsapp") {
                        sendWhatsapp(campaignID, element["first_name"], element["mobile_no"]);
                    }
                    var campaignParam = {
                        TableName: 'campaigntable',
                        Item: {
                            campaignid: campaignID,
                            userid: element["id"],
                            channel: channel,
                            status: 0,
                            date: moment().format("DD/MM/YYYY")
                        }
                    }

                    documentClient.put(campaignParam, function(err, data) {
                        if (err) {
                            //console.log(err);
                        } else {
                            
                        }
                    });
                });
            }
        });
    } else {
        res.status(400).json({status: 400, message: 'invalid channel'});
    }
});        

var sendEmail = function(campaignID, username, email) {
    var params = {
        Destination: {
         ToAddresses: [
            email
         ]
        }, 
        Message: {
         Body: {
          Html: {
           Charset: "UTF-8", 
           Data: "<img src=\"http://hackathon-env.23kccc2pvp.ap-south-1.elasticbeanstalk.com/logo/"+campaignID+"\"> <br> <h1>Dear "+username+",</h1> It has been quite a long we have seen you on our website. There are some exciting offers for you. <a class=\"ulink\" href=\"https://carrentals.com?campaignid="+campaignID+"\" target=\"_blank\">Please click on the link</a>"
          }, 
          Text: {
           Charset: "UTF-8", 
           Data: "Dear "+username+", It has been quite a long we have seen you on our website. There are some exciting offers for you. Please click on the link - https://carrentals.com?campaignid="+campaignID
          }
         }, 
         Subject: {
          Charset: "UTF-8", 
          Data: "Greetings from CarRentals.com"
         }
        }, 
        Source: "offers.carrentals@gmail.com"
       };
       ses.sendEmail(params, function(err, data) {
         if (err) console.log(err, err.stack); // an error occurred
         else     console.log(data);       
       });
}

var sendWebpush = function(campaignID) {
    const payload = JSON.stringify({ title: "Hey from Carrentals", body: "There are some exciting offers waiting for you", url: "https://carrentals.com?campaignid="+campaignID });
    var params = {
        TableName: "webpush"
    };
    documentClient.scan(params, onScan);
    function onScan(err, data) {
        if (err) {
            console.error("Unable to scan the table. Error JSON:", JSON.stringify(err, null, 2));
        } else {        
            data.Items.forEach(function(itemdata) {
              webpush.sendNotification(itemdata, payload).then(response => {
                console.log(response);
              }).catch(error => {
                console.error(error);
              });
            });
  
            // continue scanning if we have more items
            if (typeof data.LastEvaluatedKey != "undefined") {
                params.ExclusiveStartKey = data.LastEvaluatedKey;
                documentClient.scan(params, onScan);
            }
        }
    }
}

var sendWhatsapp = function(campaignID, username, mobile) {
    client.messages
      .create({
        body: 'Hello '+username+"! There are some exciting offers waiting for you in carrentals. https://carrentals.com?campaignid="+campaignID,
        from: 'whatsapp:+14155238886',
        to: 'whatsapp:+91'+mobile
      })
      .then(message => console.log(message.sid))
      .done();
}

app.use(require('express-static')('./'));

app.listen(process.env.PORT || 3000);