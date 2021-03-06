"use strict";
//NPM dependencies
const async = require("async");
const o2x = require("object-to-xml");
const twilio = require("twilio");

//Project dependencies
const config = require("./config");
const phoneComponent = require("./phoneComponent");

const VoiceResponse = twilio.twiml.VoiceResponse;

//Cache database in order to keep in memory last conferences
let databaseInMemory = [];

//Collection model
const colectionStructure = {
  clientConferenceName: "",
  usersConferenceName: "",
  timestamp: ""
};

//List of users stored in the config file
const USERS = [];

config.users.forEach(function(user){
  user.text = user.number;
  user.number = "sip:" + user.number + "@" + config.twilio.sipDomain;
  USERS.push(user);
})

//Create authenticated instance of the twilio lib
const client = twilio(config.twilio.apiKey, config.twilio.apiSecret, {
  accountSid: config.twilio.accountSid
});

//Function to get server URL
function getServer(req) {
  let server = req.protocol + "://" + req.get("host");
  return server;
}

//endpoint to parse called number and create call to user
module.exports.formatPhoneNumberPerUserPOST = function(req, res, next) {
  if (
    config.twilio.apiKey === undefined ||
    config.twilio.apiSecret === undefined ||
    config.twilio.accountSid === undefined
  ) {
    return res
      .status(405)
      .send(o2x({ message: "accountSid or authToken invalid" }));
  }

  let called;
  let user;

  if (req.body.called !== undefined) {
    called = req.body.called;
  } else if (req.body.Called !== undefined) {
    called = req.body.Called;
  } else if (req.query.called !== undefined) {
    called = req.query.called;
  } else {
    called = req.query.Called;
  }

  if (req.body.user !== undefined) {
    user = req.body.user;
  } else if (req.body.User !== undefined) {
    user = req.body.User;
  } else if (req.query.user !== undefined) {
    user = req.query.user;
  } else {
    user = req.query.User;
  }

  res.set("Content-Type", "text/xml");

  if (called === undefined || called === "") {
    return res
      .status(405)
      .send(o2x({ message: "There is no called number selected" }));
  }

  if (user === undefined || user === "") {
    return res.status(405).send(o2x({ message: "There is no user selected" }));
  }

  if (called.indexOf("@") > -1) {
    called = called.substring(called.indexOf(":") + 2, called.indexOf("@"));
  }

  if (called.indexOf("%40") > -1) {
    called = called.substring(called.indexOf("%3A") + 2, called.indexOf("%40"));
  }

  phoneComponent.formatPhoneNumber(called, function(err, returnedNumber) {
    if (err) {
      return res
        .status(405)
        .send(o2x({ message: "Error to calculate this number" }));
    }
    let server = getServer(req);
    let fullUrl = server + "/Click-Dial";
    let userCall = "sip:" + user + "@" + config.twilio.sipDomain;

    client.calls.create(
      {
        url: fullUrl + "?number=" + called,
        method: "POST",
        to: userCall,
        from: config.twilio.callerId,
        statusCallback: server + "/events",
        statusCallbackMethod: "POST",
        statusCallbackEvent: ["completed"]
      },
      function(err, call) {
        if (err) {
          res.status(405).send(o2x({ message: err }));
          return;
        }
        res.status(200).send(o2x({ message: "Thanks for calling!" }));
      }
    );
  });
};

module.exports.clickBetweenClients = function(req, res, next){
  let called;
  let user;

  if (req.body.called !== undefined) {
    called = req.body.called;
  }

  if (req.body.user !== undefined) {
    user = req.body.user;
  }

  if (called === undefined || called === "") {
    return res
      .status(405)
      .send({ message: "There is no called number selected" });
  }

  if (user === undefined || user === "") {
    return res.status(405).send({ message: "There is no user selected" });
  }

  let userCalled = called;
  let userCalling = user;
  let server = getServer(req);
  let fullUrl = server + "/Connect-Users?sip=" + userCalled;

  client.calls.create(
    {
      url: fullUrl,
      method: "POST",
      to: userCalling,
      from: config.twilio.callerId
    },
    function(err, call) {
      if (err) {
        res.status(405).send({ message: err });
        return;
      }
        res.status(200).send({ message: "Thanks for calling!" });
      });
}

module.exports.connectUsers = function(req, res, next){
    let sip;

    if (req.body.sip !== undefined) {
      sip = req.body.sip;
    } else if (req.body.Sip !== undefined) {
      sip = req.body.Sip;
    } else if (req.query.sip !== undefined) {
      sip = req.query.sip;
    } else {
      sip = req.query.Sip;
    }
  
    if (sip === undefined || sip === "") {
      return res
        .status(405)
        .send(o2x({ message: "There is no number selected" }));
    }

    res.contentType("application/xml");
    const twimlResponse = new VoiceResponse();
    const dial = twimlResponse.dial({ callerId: config.twilio.callerId });
    dial.sip(sip);

    // We include a second Dial here. When the original Dial ends because the
    // customer is redirected, the user continues to this Dial and joins their
    // own conference.
    const confDial = twimlResponse.dial({});
    confDial.conference({}, req.body.CallSid + "_Users");
    res.status(200).send(twimlResponse.toString());
}

//This endpoint returns a Twiml in order to call called number
module.exports.outboundCallPOST = function(req, res, next) {
  let called;

  if (req.body.number !== undefined) {
    called = req.body.number;
  } else if (req.body.Number !== undefined) {
    called = req.body.Number;
  } else if (req.query.number !== undefined) {
    called = req.query.number;
  } else {
    called = req.query.Number;
  }

  if (called === undefined || called === "") {
    return res
      .status(405)
      .send(o2x({ message: "There is no number selected" }));
  }

  if (called.indexOf("@") > -1) {
    called = called.substring(called.indexOf(":") + 2, called.indexOf("@"));
  }

  if (called.indexOf("%40") > -1) {
    called = called.substring(called.indexOf("%3A") + 2, called.indexOf("%40"));
  }

  phoneComponent.formatPhoneNumber(called, function(err, returnedNumber) {
    if (err) {
      return res
        .status(405)
        .send(o2x({ message: "Error to calculate this number" }));
    }
    res.contentType("application/xml");
    const twimlResponse = new VoiceResponse();
    const dial = twimlResponse.dial({ callerId: config.twilio.callerId });
    dial.number({}, returnedNumber);

    // We include a second Dial here. When the original Dial ends because the
    // customer is redirected, the user continues to this Dial and joins their
    // own conference.
    const confDial = twimlResponse.dial({});
    confDial.conference({}, req.body.CallSid + "_Users");
    res.status(200).send(twimlResponse.toString());
  });
};

//This endpoint returns a Twiml in order to call called number
module.exports.outboundCallGET = function(req, res, next) {
  // res.contentType('application/xml');
  // res.sendFile(__dirname + '/public/resp.xml');
  // return;

  let called;

  if (req.query.number !== undefined) {
    called = req.query.number;
  } else {
    called = req.query.Number;
  }

  if (called === undefined || called === "") {
    return res
      .status(405)
      .send(o2x({ message: "There is no number selected" }));
  }

  if (called.indexOf("@") > -1) {
    called = called.substring(called.indexOf(":") + 2, called.indexOf("@"));
  }

  if (called.indexOf("%40") > -1) {
    called = called.substring(called.indexOf("%3A") + 2, called.indexOf("%40"));
  }

  phoneComponent.formatPhoneNumber(called, function(err, returnedNumber) {
    if (err) {
      return res
        .status(405)
        .send(o2x({ message: "Error to calculate this number" }));
    }
    res.contentType("application/xml");
    res.status(200).send(
      o2x({
        '?xml version="1.0" encoding="utf-8"?': null,
        Response: {
          Dial: {
            "@": {
              callerId: config.twilio.callerId
            },
            "#": {
              Number: returnedNumber
            }
          }
        }
      })
    );
    /*let twimlResponse = new VoiceResponse();
    twimlResponse.say('We are dialling your number.',
      { voice: 'alice' });
    twimlResponse.dial(returnedNumber);
    res.status(200).send(twimlResponse.toString());*/
  });
};

//This endpoint parses called number and returns a Twiml in order to call called number
module.exports.clickClient = function(req, res, next) {
  let called;

  if (req.body.called !== undefined) {
    called = req.body.called;
  } else if (req.body.Called !== undefined) {
    called = req.body.Called;
  } else if (req.query.called !== undefined) {
    called = req.query.called;
  } else {
    called = req.query.Called;
  }

  res.set("Content-Type", "text/xml");

  if (called === undefined || called === "") {
    return res
      .status(405)
      .send(o2x({ message: "There is no called number selected" }));
  }

  if (called.indexOf("@") > -1) {
    called = called.substring(called.indexOf(":") + 2, called.indexOf("@"));
  }

  if (called.indexOf("%40") > -1) {
    called = called.substring(called.indexOf("%3A") + 2, called.indexOf("%40"));
  }

  phoneComponent.formatPhoneNumber(called, function(err, returnedNumber) {
    if (err) {
      res.status(405).send(o2x({ message: "Error to calculate this number" }));
      return;
    }
    res.status(200).send(
      o2x({
        '?xml version="1.0" encoding="utf-8"?': null,
        Response: {
          Dial: {
            "@": {
              callerId: config.twilio.callerId
            },
            "#": {
              Number: returnedNumber
            }
          }
        }
      })
    );
  });
};

//This endpoint finish call according to callSid
module.exports.dropCall = function(req, res, next) {
  let callSid = req.body.callSid;
  if (callSid === undefined) {
    return res.status(405).send({ message: "There is no callSid" });
  }
  client.calls(callSid).update({
    status: "completed"
  }, function(err, call) {
    if (err) {
      return res.status(500).send(err);
    }
    res.status(200).send({ message: "success" });
  });
};

//This endpoint returns a list of calls in progress - JSON
module.exports.callList = function(req, res, next) {
  client.calls.list(
    {
      status: "in-progress"
      // status: "completed"
    },
    function(err, data) {
      if (err) {
        return res.status(500).send(err);
      }
      let arrayOfCalls = [];
      data.forEach(call => {
        let progressCall = {};
        progressCall.from = call.from;
        progressCall.to = call.to;
        progressCall.sid = call.sid;
        progressCall.startTime = call.startTime;
        progressCall.parentCallSid = call.parentCallSid;
        arrayOfCalls.push(progressCall);
      });
      return res.status(200).send(arrayOfCalls);
    }
  );
};

//This function retrieve specific call according to callSid
function getCall(callSid, cb) {
  client
    .calls(callSid)
    .fetch()
    .then(call => {
      let callData = {};
      callData.to = call.to;
      callData.from = call.from;
      return cb(null, callData);
    });
}

//This function get all participantes of a conference
function getParticipants(progressConference, cb) {
  let conf = client.conferences(progressConference.sid);
  //Retrieve participants list
  conf.participants.list({}, function(err, data) {
    //for in participantes of a conference
    async.each(
      data,
      function(participant, next) {
        //comparte participant call with user list
        getCall(participant.callSid, function(err, result) {
          let part = {
            callSid: participant.callSid,
            to: result.to
          };
          let noOfParticipants = progressConference.participants.length;
          USERS.forEach(function(user) {
            if (user.number === result.to) {
              part.toUserText = user.user;
              progressConference.participants.push(part);
            }
          });
          if (noOfParticipants === progressConference.participants.length) {
            progressConference.participants.push(part);
          }
          next();
        });
      },
      function(err) {
        return cb(null, progressConference);
      }
    );
  });
}

//This endpoint retrieves a list of conferences
module.exports.conferenceList = function(req, res, next) {
  client.conferences.list(
    {
      status: "in-progress"
      // status: "completed"
    },
    function(err, data) {
      if (err) {
        return res.status(500).send(err);
      }

      if (data.length < 1 && databaseInMemory.length >= 1) {
        databaseInMemory.forEach(function(data, index){
          let currentTime = Math.floor(Date.now() / 1000) + 1800;
          if(data.timestamp < currentTime){
            databaseInMemory.splice(index, 1);
          }
        });
      }

      let arrayOfConferences = [];

      //retrieve list of participants
      async.each(
        data,
        function(conference, next) {
          let progressConference = {
            participants: []
          };
          progressConference.sid = conference.sid;
          progressConference.friendlyName = conference.friendlyName;
          progressConference.dateCreated = conference.dateCreated;
          getParticipants(progressConference, function(err, result) {
            if (err) {
              return next();
            }
            arrayOfConferences.push(result);
            next();
          });
        },
        function(err) {
          res.status(200).send(arrayOfConferences);
        }
      );
    }
  );
};

module.exports.createConference = function(req, res, next) {
  let user1;
  let user2No;
  let user2CallSid;
  let clientNo;
  let clientCallSid;

  if (req.body.user1 !== undefined) {
    user1 = req.body.user1;
  }
  if (req.body.user2No !== undefined) {
    user2No = req.body.user2No;
  }
  if (req.body.user2CallSid !== undefined) {
    user2CallSid = req.body.user2CallSid;
  }
  if (req.body.clientNo !== undefined) {
    clientNo = req.body.clientNo;
  }
  if (req.body.clientCallSid !== undefined) {
    clientCallSid = req.body.clientCallSid;
  }

  if (
    user1 === undefined ||
    clientNo === undefined ||
    clientCallSid === undefined ||
    clientNo === undefined ||
    user2CallSid === undefined
  ) {
    return res.status(405).send({ message: "Missing parameters" });
  }

  let newCollection = colectionStructure;

  let server = getServer(req);
  // conference name will be the parent call SID
  let conferenceName = user2CallSid;
  let fullUrl = server + "/Join-Conference?id=" + conferenceName;
  let onHoldConfereneName = conferenceName;
  client.calls(clientCallSid).update({
    url: fullUrl,
    method: "POST"
  }, function(err, call) {
    if (err) {
      res.status(405).send({ message: err });
      return;
    }

    newCollection.clientConferenceName = conferenceName;

    conferenceName = user2CallSid + "_Users";
    fullUrl = server + "/Join-Conference?id=" + conferenceName;

    newCollection.usersConferenceName = conferenceName;
    newCollection.timestamp = Date.now();

    client.calls.create(
      {
        url: fullUrl,
        method: "POST",
        to: user1,
        from: config.twilio.callerId
      },
      function(err, call) {
        if (err) {
          res.status(405).send({ message: err });
          return;
        }
        databaseInMemory.push(newCollection);
        setOnHold(onHoldConfereneName);
        return res.status(200).send({ message: "Conferences created" });
      }
    );
  });
};

function setOnHold(confName) {
  client.conferences.list(
    {
      status: "in-progress"
    },
    function(err, data) {
      if (err) {
        return;
      }
      data.forEach(function(element) {
        if (element.friendlyName == confName) {
          let confSid = element.sid;
          let conf = client.conferences(confSid);
          //Retrieve participants list
          conf.participants.list({}, function(err, partData) {
            partData.forEach(function(participant) {
              let callSid = participant.callSid;
              client
                .conferences(confSid)
                .participants(callSid)
                .update({
                  hold: "true",
                  holdUrl:
                    "http://twimlets.com/holdmusic?Bucket=com.twilio.music.classical&amp;Message=please%20wait"
                })
                .then();
            });
          });
        }
      }, this);
    }
  );
}

// This is the endpoint that Twilio will call when you answer the phone
module.exports.joinConference = function(req, res, next) {
  // res.contentType('application/xml');
  // res.sendFile(__dirname + '/public/resp.xml');
  // return;

  let conferenceName = req.query.id;

  // We return TwiML to enter the same conference
  const twiml = new VoiceResponse();
  const dial = twiml.dial();

  dial.conference(conferenceName, {
    startConferenceOnEnter: true,
    endConferenceOnExit: false
  });
  res.contentType("application/xml");
  res.set("Content-Type", "text/xml");
  res.send(twiml.toString());
};

module.exports.joinClientConference = function(req, res, next) {
  let callSid = req.body.callSid;
  let conferenceName = req.body.conferenceName;
  let previousConferenceSid = req.body.conferenceSid;

  if (callSid === undefined || conferenceName === undefined) {
    return res.status(405).send({ message: "Missing parameters" });
  }

  let isCallFound = false;
  let error = {
    hasError: false,
    err: ""
  };

  databaseInMemory.forEach(function(doc) {
    if (doc.usersConferenceName === conferenceName && !isCallFound) {
      isCallFound = true;

      let server = getServer(req);
      let fullUrl = server + "/Join-Conference?id=" + doc.clientConferenceName;

      client.calls(callSid).update({
        url: fullUrl,
        method: "POST"
      }, function(err, call) {
        if (err) {
          error.hasError = true;
          error.err = err;
        }
        client
        .conferences(previousConferenceSid)
        .fetch()
        .then(function(conf) {
          let progressConference = {
            participants: []
          };
          progressConference.sid = conf.sid;
          progressConference.friendlyName = conf.friendlyName;
          progressConference.dateCreated = conf.dateCreated;
          getParticipants(progressConference, function(err, data) {
            data.participants.forEach(function(participant){
              client.calls(participant.callSid).update({
                status: "completed"
              }, function(err, call) {
                if (err) {
                  res.status(405).send({ message: err });
                  return;
                }
              });
            });
          });
        });
      });
    }
  });

  if (error.hasError) {
    return res.status(405).send({ message: error.err });
  } else {
    return res.status(200).send({ message: "Ok" });
  }
};

//this endpoint creates a call and join it to a conference
module.exports.createCallAndJoinConference = function(req, res, next) {
  let conferenceSid = req.body.conferenceSid;
  let conferenceName = req.body.conferenceName;
  let callNo = req.body.callNo;
  if (
    conferenceSid === undefined ||
    conferenceName === undefined ||
    callNo === undefined
  ) {
    return res.status(405).send({ message: "Missing parameters" });
  }

  let server = getServer(req);
  let fullUrl = server + "/Join-Conference?id=" + conferenceName;

  if (conferenceName.indexOf("_Users") > -1) {
    client.calls.create(
      {
        url: fullUrl,
        method: "POST",
        to: callNo,
        from: config.twilio.callerId
      },
      function(err, call) {
        if (err) {
          res.status(405).send(o2x({ message: err }));
          return;
        }
        res.status(200).send({ message: "Thanks for calling!" });
      }
    );
  } else {
    let newConferenceName;
    let newConferenceNameUser;
    let server = getServer(req);
    let fullUrl = server + "/Join-Conference?id=";
    let fullUrlUser = server + "/Join-Conference?id=";
    let currentUrl;
    client
      .conferences(conferenceSid)
      .fetch()
      .then(function(conf) {
        let progressConference = {
          participants: []
        };
        progressConference.sid = conf.sid;
        progressConference.friendlyName = conf.friendlyName;
        progressConference.dateCreated = conf.dateCreated;
        getParticipants(progressConference, function(err, data) {
          if (err) {
            return res.status(500).send({ message: "Try Again" });
          }
          data.participants.forEach(function(participant){
            if(participant.to.indexOf(config.twilio.sipDomain) > -1){
              if(newConferenceNameUser === undefined){
                newConferenceNameUser = participant.callSid + "_Users";
                fullUrlUser += newConferenceNameUser;
              }
              currentUrl = fullUrlUser;
            }
            else{
              if(newConferenceName === undefined){
                newConferenceName = participant.callSid;
                fullUrl += newConferenceName;
              }
              currentUrl = fullUrl;
            }
            client.calls(participant.callSid).update({
              url: currentUrl,
              method: "POST"
            }, function(err, call) {
              if (err) {
                res.status(405).send({ message: err });
                return;
              }
            });
          });
          let newCollection = colectionStructure;
          newCollection.clientConferenceName = newConferenceName;
          newCollection.usersConferenceName = newConferenceNameUser;
          newCollection.timestamp = Date.now();
          databaseInMemory.push(newCollection);
          client.calls.create(
            {
              url: fullUrlUser,
              method: "POST",
              to: callNo,
              from: config.twilio.callerId
            },
            function(err, call) {
              if (err) {
                res.status(405).send(o2x({ message: err }));
                return;
              }
              res.status(200).send({ message: "Thanks for calling!" });
            }
          );
        });
      });
  }
};

//This endpoint retrives a list of users
module.exports.getUsers = function(req, res, next) {
  return res.status(200).send({ users: USERS });
};

module.exports.events = function(req, res, next){
  let to = req.body.to;
  let fromNumber = req.body.from;
  let callStatus = req.body.CallStatus;
  let callSid = req.body.callSid;

  getCall(callSid, function(err, data){
    if(err){

    }
    client.calls.create(
      {
        url: 'http://demo.twilio.com/docs/voice.xml',
        to: data.to,
        from: config.twilio.callerId,
      },
      function(err, call) {
        if (err) {
          res.status(405).send(o2x({ message: err }));
          return;
        }
        res.status(200).send(o2x({ message: "Thanks for calling!" }));
      }
    );
  });
};
