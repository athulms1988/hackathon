const express = require('express');
const cors = require('cors')
const AWS = require('aws-sdk');
const app = express();
const moment = require('moment');
const fs = require('fs');
app.use(cors())
app.use(require('body-parser').json());

const accessKeyID = process.env.ACCESS_KEY_ID;
const secretAccessKey = process.env.SECRET_ACCESS_KEY;
const region = process.env.REGION;
var documentClient = new AWS.DynamoDB.DocumentClient({accessKeyId: accessKeyID, secretAccessKey: secretAccessKey, region: region, apiVersion: '2012-10-08'});
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
                var userIDKey = ":titlevalue"+index;
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
        ExpressionAttributeNames: {'#status' : 'status'},
        ExpressionAttributeValues: {
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

app.use(require('express-static')('./'));

app.listen(process.env.PORT || 3000);