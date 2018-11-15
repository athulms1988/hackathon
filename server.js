const express = require('express');
const cors = require('cors');
const webpush = require('web-push');
const AWS = require('aws-sdk');
const app = express();
const moment = require('moment');
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
          var failyActiveUserCount = 0;
          var inactiveUserCount = 0;
          data.Items.forEach(function(element, index, array) {
            var lastLogin = moment(element["last_login"],'DD/MM/YYYY');
            var dateDiff = 0;
            if(lastLogin) {
                dateDiff = currentTime.diff(lastLogin, 'days');
            }
            if(dateDiff <= active) {
                activeUserCount++;
            } else if(dateDiff <= fairlyActive) {
                failyActiveUserCount++;
            } else {
                inactiveUserCount++;
            }
            });
          var totalCount = activeUserCount + failyActiveUserCount + inactiveUserCount;
          res.status(201).json({status: 200, data: { 
            totalCount: totalCount, 
            activeUserCount: activeUserCount, 
            failyActiveUserCount: failyActiveUserCount, 
            inactiveUserCount: inactiveUserCount
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

app.get(['/logo','/logo/:campaignid'], (req, res) => {
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

app.get('/sendemail', (req, res) => {
    var params = {
        Destination: {
         ToAddresses: [
            "athulms@gmail.com"
         ]
        }, 
        Message: {
         Body: {
          Html: {
           Charset: "UTF-8", 
           Data: "<img src=\"http://hackathon-env.23kccc2pvp.ap-south-1.elasticbeanstalk.com/logo/1ZNvjD5VS8\"> <br> <h1>Dear Athul,</h1> It has been quite a long we have seen you on our website. There are some exicting offers for you. <a class=\"ulink\" href=\"https://carrentals.com?campaignid=1ZNvjD5VS8\" target=\"_blank\">Please click on the link</a>"
          }, 
          Text: {
           Charset: "UTF-8", 
           Data: "Dear Athul, It has been quite a long we have seen you on our website. There are some exicting offers for you. Please click on the link - https://carrentals.com?campaignid=1ZNvjD5VS8"
          }
         }, 
         Subject: {
          Charset: "UTF-8", 
          Data: "Greetings from CarRentals.com"
         }
        }, 
        Source: "athul.salimkumar@ibsplc.com"
       };
       ses.sendEmail(params, function(err, data) {
         if (err) console.log(err, err.stack); // an error occurred
         else     console.log(data);       
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
                failyActiveUserCount = 0,
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

app.use(require('express-static')('./'));

app.listen(process.env.PORT || 3000);