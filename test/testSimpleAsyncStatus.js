var flow = require("../lib/flow.js");
var assert       = require('double-check').assert;

process.env['RUN_WITH_WHYS'] = true;

assert.callback("Simple async status test", function(end){
    var logs = "";
    var expectedLogs = "begin" +
        "step2" +
        "step1" +
        "end";

    var expectedStatuses = "created"+
            "running"+
            "running"+
            "running"+
            "running"+
            "done";

    var statuses = "";
    function testResults(){
        assert.equal(logs,expectedLogs,"Difference between expected logs and actual results");
        setTimeout(function(){
            statuses+=fl.getStatus();
            assert.equal(statuses,expectedStatuses,"Difference between expected statuses and actual statuses");
            end();
        },10)
    }

    var f = flow.create("Flow example", {
        begin:function(a1,a2){
            logs+="begin";
            statuses+=this.getStatus();
            this.next("step1");
            this.step2();
        },
        step1:function(a){
            statuses+=this.getStatus();
            logs += "step1";
        },
        step2:function(a){
            statuses+=this.getStatus();
            logs += "step2";
        },
        end:{
            join:"step1,step2",
            code:function(a){
                statuses+=this.getStatus();
                logs += "end";
                testResults();
            }
        }
    });
    statuses+= "created";
    var fl = f();
})



