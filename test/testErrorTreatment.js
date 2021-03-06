var flow = require("../lib/flow.js");
var assert       = require('double-check').assert;
assert.callback("Test flow error treatment", function(end){
    var logs = "";
    var expectedLogs = "begin" +
        "step1" +
        "step2" +
        "error";
    var expectedStatuses = "created"+
            "running"+
            "running"+
            "running"+
            "failed";

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
            this.step1();
            this.step2();
        },
        step1:function(a){
            statuses+=this.getStatus();
            logs += "step1";

        },
        step2:function(a){
            statuses+=this.getStatus();
            logs += "step2";
            throw "Go to error phase"
        },
        end:{
            join:"step1,step2",
            code:function(a){
                statuses+=this.getStatus();
                logs += "end";
                testResults();
            }
        },
        error:function(){
            logs+="error";
            testResults();
        }
    });
    statuses+= "created";
    var fl = f();
})



