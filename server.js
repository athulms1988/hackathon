const express = require('express');
const cors = require('cors')
const AWS = require('aws-sdk');
const app = express();
const moment = require('moment');
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

app.use(require('express-static')('./'));

app.listen(process.env.PORT || 3000);