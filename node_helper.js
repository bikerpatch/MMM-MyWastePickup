const request = require('request');

var NodeHelper = require("node_helper");
var fs = require('fs');
var parse = require("csv-parse");
var moment = require("moment");


module.exports = NodeHelper.create({

  start: function() {
    console.log("[MYWASTEPICKUP] Starting node_helper for module: " + this.name);

    this.schedule = null;

    //new schedule file can be downloaded at
    //https://www.toronto.ca/city-government/data-research-maps/open-data/open-data-catalogue/garbage-and-recycling/#8e932504-cabb-71b1-b23a-6cf504f7c474
    this.scheduleCSVFile = this.path + "/schedule.csv";

    this.scheduleCustomCSVFile = this.path + "/schedule_custom.csv";

  },

  socketNotificationReceived: function(notification, payload) {

    var self = this;

    if (payload.debug == true) console.log("[MYWASTEPICKUP] Notification received: ", notification);
    if ((this.schedule == null) || ((payload.collectionCalendar == "CustomURL") && (payload.collectionCalendarUrl != null))) {
      //not yet setup, or URL needs refreshing. Load and parse the data file; set up variables.

      if (payload.debug == true) console.log("[MYWASTEPICKUP] Schedule detected as null");
      if ((payload.collectionCalendar == "CustomURL") && (payload.collectionCalendarUrl != null)) {
        if (payload.debug == true) console.log("[MYWASTEPICKUP] Getting schedule from URL: ", payload.collectionCalendarUrl);
        // get from URL

        this.callAPI(payload.collectionCalendarUrl, payload.debug, (err, rawData)=>{
          self.processRawData(err, rawData, payload);
        });

      } else {
        
        var scheduleFile = this.scheduleCSVFile;
        if (payload.collectionCalendar == "Custom") {
          scheduleFile = this.scheduleCustomCSVFile;
        }

        if (payload.debug == true) console.log("[MYWASTEPICKUP] Getting schedule from file: ", scheduleFile);
        
        fs.readFile(scheduleFile, "utf8", function(err, rawData) {
          self.processRawData(err, rawData, payload);
        });

      }
    } else {
      this.getNextPickups(payload);
    }

  },

  processRawData: function(err, rawData, payload) {
    var self = this;

    if (payload.debug == true) console.log("[MYWASTEPICKUP] Processing raw data");
    
    if (err) throw err;
    parse(rawData, {delimiter: ",", columns: true, ltrim: true}, function(err, parsedData) {
      if (err) throw err;

      self.schedule = parsedData;
      self.postProcessSchedule();
      self.getNextPickups(payload);
    });
  },

  postProcessSchedule: function() {

    this.schedule.forEach( function(obj) {

      //convert date strings to moment.js Date objects
      obj.pickupDate = moment(obj.WeekStarting, "MM/DD/YY");

      // to do:
      // check if pickup date lands on a holiday.
      // If so, move to next day

      //reassign strings to booleans for particular waste type
      obj.GreenBin = (obj.GreenBin == "0" ? false : true);
      obj.Garbage = (obj.Garbage == "0" ? false : true);
      obj.Recycling = (obj.Recycling == "0" ? false : true);
      obj.YardWaste = (obj.YardWaste == "0" ? false : true);
      obj.ChristmasTree = (obj.ChristmasTree == "0" ? false : true);
    });

  },

  getNextPickups: function(payload) {
    var start = moment().startOf("day"); //today, 12:00 AM
    var end = moment().startOf("day").add(payload.weeksToDisplay * 7, "days");

    //find info for next pickup dates
    var nextPickups = this.schedule.filter(function (obj) {
      return obj.Calendar == payload.collectionCalendar &&
        obj.pickupDate.isSameOrAfter(start) && 
        obj.pickupDate.isBefore(end);
    });

    this.sendSocketNotification('MMM-MYWASTEPICKUP-RESPONSE' + payload.instanceId, nextPickups);

  },

  callAPI: function(url, debug, callback) {
    
    request(url, (error, response, body)=>{
      
      if (debug == true) console.log("[MYWASTEPICKUP] Making URL request");

      if (error) {
        console.error("[MYWASTEPICKUP] URL Error ", error);
        callback(error);
      } else {

        if (debug == true) console.log("[MYWASTEPICKUP] Response ", response && response.statusCode);

        callback(error, body);
      }
    })
  }

});