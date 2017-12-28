/**
 * Created by ctalmacel on 25/01/16.
 */

exports.create = function (flowName, states) {
    return function () {
        return new flow(flowName, states, mkArgs(arguments, 0));
    }
}

/* Rather complex because we tried to get better context information for whys. To be reviewed */

function flow(flowName, states, beginArgs) {
    var name = flowName;
    var activePhases = {};
    var flowStatus = "created";
    var statesRegister = {};
    var joinsRegister = {};
    var self = this;
    var currentPhase = undefined;
    var states = states;

    function attachStatesToFlow(states) {

        function registerState(state) {
            function wrapUpdates(stateName) {

                var dynamicMotivation = undefined;

                function WHYDynamicResolver() {
                    function toBeExecutedWithWHY() {
                        var parentPhase = currentPhase;
                        currentPhase = stateName;
                        registerNewFunctionCall(stateName);
                        var ret = states[stateName].apply(self, mkArgs(arguments, 0));
                        makePhaseUpdatesAfterCall(stateName);
                        currentPhase = parentPhase;
                        return ret;
                    }

                    toBeExecutedWithWHY.why = dummyWhy;
                    return addErrorTreatment(toBeExecutedWithWHY.why(decideMotivation(self, state))).apply(self, mkArgs(arguments, 0))
                }

                function decideMotivation(flow, stateName) {
                    if (dynamicMotivation === undefined) {
                        if (flow.getCurrentPhase()) {
                            motivation = flow.getCurrentPhase() + " to " + stateName;
                        } else {
                            motivation = stateName;
                        }
                    } else {
                        motivation = dynamicMotivation;
                    }
                    dynamicMotivation = undefined;
                    return motivation;
                }

                WHYDynamicResolver.why = function (motivation) {
                    dynamicMotivation = motivation;
                    return this;
                }
                return WHYDynamicResolver;
            }

            statesRegister[state] = {
                code: states[state],
                joins: []
            }

            self[state] = wrapUpdates(state);
        }

        function registerJoin(join) {
            joinsRegister[join] = {
                code: states[join].code,
                inputStates: {},
                tryOnNextTick: false
            }

            var inStates = states[state].join.split(',');
            inStates.forEach(function (input) {
                input = input.trim();
                joinsRegister[join].inputStates[input] = {
                    calls: 0,
                    finishedCalls: 0
                };
            })

        }

        function joinStates() {
            for (var join in joinsRegister) {
                for (var inputState in joinsRegister[join].inputStates) {
                    statesRegister[inputState].joins.push(join);
                }
            }
        }

        self.error = function (error) {
            if (error) {
                var motivation = currentPhase + " failed";
                if (states['error'] !== undefined) {
                    states['error'].why = dummyWhy;
                    states['error'].why(motivation).apply(self, [error]);
                }
                else {
                    function defaultErrorWHY(error) {
                        if (error) {
                            console.error(self.getCurrentPhase() + " failed");
                            console.log(error.stack);
                        }
                    }

                    defaultErrorWHY.why = dummyWhy;

                    defaultErrorWHY.why(motivation)(error);
                }
            }
        }

        for (var state in states) {

            if (state == "error") {
                continue;
            }

            if (typeof states[state] === "function") {
                registerState(state);
            }
            else {
                registerJoin(state);
            }
        }
        joinStates();
    }

    this.next = function () {
        process.nextTick(this.continue.apply(this, mkArgs(arguments, 0)));
    }

    function registerNewFunctionCall(stateName) {

        updateStatusBeforeCall(stateName);
        notifyJoinsOfNewCall(stateName);

        function notifyJoinsOfNewCall(stateName) {
            statesRegister[stateName].joins.forEach(function (join) {
                joinsRegister[join].inputStates[stateName]['calls']++
            });
        }
    }

    this.getStatus = function () {
        return flowStatus;
    };
    this.getCurrentPhase = function () {
        return currentPhase;
    }
    this.getActivePhases = function () {
        return activePhases;
    };
    this.getName = function () {
        return name;
    }

    function updateStatusBeforeCall(stateName) {
        if (activePhases[stateName] == undefined) {
            activePhases[stateName] = 1;
        } else {
            activePhases[stateName]++;
        }
    }

    function updateStatusAfterCall(stateName) {
        activePhases[stateName]--;

        if (activePhases[stateName] === 0) {
            var done = true;
            for (var phase in activePhases) {
                if (activePhases[phase] > 0) {
                    done = false;
                    break;
                }
            }
            if (done) {
                flowStatus = "done";
            }
        }
    }

    function makePhaseUpdatesAfterCall(stateName) {
        updateJoinsAfterCall(stateName);
        updateStatusAfterCall(stateName);

        function updateJoinsAfterCall(stateName) {
            statesRegister[stateName].joins.forEach(function (joinName) {
                joinsRegister[joinName].inputStates[stateName]['finishedCalls']++;
                if (joinsRegister[joinName]['tryOnNextTick'] === false) {
                    joinsRegister[joinName]['tryOnNextTick'] = true;
                    var caller = null;
                    try {
                        if (global.__global__enable_RUN_WITH_WHYS) {
                            caller = whys.getGlobalCurrentContext().currentRunningItem;
                        }
                    } catch (err) {
                    }
                    ; //TODO: strange, refactoring
                    updateStatusBeforeCall(joinName);
                    var parentPhase = self.getCurrentPhase();
                    process.nextTick(function () {
                        tryRunningJoin(joinName, caller, parentPhase);
                        updateStatusAfterCall(joinName);
                    })
                }
            });


            function tryRunningJoin(joinName, caller, parentPhase) {

                joinsRegister[joinName]['tryOnNextTick'] = false;

                function joinReady(joinName) {
                    var join = joinsRegister[joinName];
                    var gotAllInputs = true;
                    for (var inputState in join.inputStates) {
                        if (join.inputStates[inputState]['finishedCalls'] == 0) {
                            gotAllInputs = false;
                            break;
                        }
                        if (join.inputStates[inputState]['finishedCalls'] != join.inputStates[inputState]['calls']) {
                            gotAllInputs = false;
                            break;
                        }
                    }
                    return gotAllInputs;
                }

                async function runJoin(joinName) {
                    var currentPhase = joinName;
                    updateStatusBeforeCall(joinName);
                    reinitializeJoin(joinName);
                    await joinsRegister[joinName].code.apply(self, []);
                    updateStatusAfterCall(joinName);
                    currentPhase = parentPhase;

                    function reinitializeJoin(joinName) {
                        for (var inputState in joinsRegister[joinName].inputStates) {
                            joinsRegister[joinName].inputStates = {
                                calls: 0,
                                finishedCalls: 0
                            }
                        }
                    }
                }

                runJoin.why = dummyWhy;

                if (joinReady(joinName)) {
                    var toRun = runJoin.why(decideMotivation(self, joinName, joinName), caller);
                    toRun = addErrorTreatment(toRun);
                    toRun(joinName);
                }

                function decideMotivation(flow, joinName, stateName) {
                    return parentPhase + " to " + joinName;
                }

            }
        }
    }


    this.continue = function () {
        var stateName = arguments[0];
        var motivation = arguments[1];

        if (!motivation) {
            motivation = self.getCurrentPhase() + " to " + stateName;
        }
        var args = mkArgs(arguments, 2);
        registerNewFunctionCall(stateName);

        var continueFn = async function () {
            currentPhase = stateName;

            if (args.length == 0) {
                args = mkArgs(arguments, 0)
            }
            await statesRegister[stateName].code.apply(self, args);
            makePhaseUpdatesAfterCall(stateName);
        };
        continueFn.why = dummyWhy;

        return addErrorTreatment(continueFn.why(motivation));
    };

    function addErrorTreatment(func) {
        async function flowErrorTreatmentWHY() {
            try {
                return await func.apply(this, mkArgs(arguments, 0));
            }
            catch (error) {
                flowStatus = "failed";
                return self.error(error);
            }
        }

        return flowErrorTreatmentWHY;
    }


    attachStatesToFlow(states);
    flowStatus = "running";

    function startFlow() {
        self.begin.apply(this, beginArgs);
    }

    startFlow.why = dummyWhy;
    startFlow.why(flowName)();
    return this;
}

function mkArgs(args, pos) {
    var argsArray = [];
    for (var i = pos; i < args.length; i++) {
        argsArray.push(args[i]);
    }
    return argsArray;
}

dummyWhy = function (motivation, caller, otherContextInfo, externalBinder) {
    return this;
};

