/*
 * $Id$
 *  -*-  indent-tabs-mode:nil -*-
 * Copyright 2013, Juniper Network Inc.
 * All rights reserved.
 * This SOFTWARE is licensed under the LICENSE provided in the
 * ../Copyright file. By downloading, installing, copying, or otherwise
 * using the SOFTWARE, you agree to be bound by the terms of that
 * LICENSE.
 */

jQuery(function ($) {
    if ($.clira == undefined)
        $.clira = { };

    var commandFiles = { };
    var commandFilesCleanup = [ ];

    $.extend($.clira, {
        debug: true,           // Have debug output use $.dbgpr()
        commands:  [ ],
        types: { },
        bundles: { },
        scoring: {
            enum: 3,
            keyword: 15,
            multiple_words: 0,
            order: 5,
            name: 5,
            name_exact: 10,
            needs_data: 5,
            nokeyword: 2,
            missing_keyword: 5,
        },
        lang: {
            match: function langMatch (name, token) {
                if (name.substring(0, token.length) == token)
                    return true;
                else false;
            },
        },
        buildObject: function buildObject (obj, base, defaults, adds) {
            if (defaults)
                $.extend(obj, defaults);
            if (base)
                $.extend(obj, base);
            if (adds)
                $.extend(obj, adds);
        },
    });

    function Command (options) {
        $.dbgpr("New command: " + options.command);
        $.clira.buildObject(this, options, { arguments: [ ]}, null);

        $.extend(this, options);
        var that = this;

        var toks = splitTokens(options.command);

        while (toks.length > 0) {
            var t = toks.pop();
            this.arguments.unshift({
                name: t,
                type: "keyword",
            });
        }

        if (this.bundle) {
            $.each(this.bundle, function (n, name) {
                if ($.clira.bundles[name] == undefined)
                    $.dbgpr("warning: unknown bundle '" + name
                            + "' for command '" + options.command + "'");
                else {
                    $.each($.clira.bundles[name].arguments, function (n, a) {
                        that.arguments.push(clone(a));
                    });
                }
            });
        }

        if (this.arguments) {
            $.each(this.arguments, function (n, arg) {
                if ($.clira.types[arg.type] == undefined)
                    $.dbgpr("warning: unknown type '" + arg.type
                            + "' for command '" + options.command + "'");
            });
        }
    }

    $.extend($.clira, {
        addCommand: function addCommand (command) {
            if (Array.isArray(command)) {
                $.each(command, function (x,c) {
                    $.clira.commands.push(new Command(c));
                });
            } else {
                $.clira.commands.push(new Command(command));
            }
        },
        addType: function addType (type) {
            if (Array.isArray(type)) {
                $.each(type, function (n, t) {
                    $.clira.types[t.name] = t;
                });
            } else {
                $.clira.types[type.name] = type;
            }
        },
        addBundle: function addBundle (bundle) {
            if (Array.isArray(bundle)) {
                $.each(bundle, function (n, b) {
                    $.clira.bundles[b.name] = b;
                });
            } else {
                $.clira.bundles[bundle.name] = bundle;
            }
        },
        loadCommandFiles: function loadCommandFiles () {
            $.ajax("/bin/list-command-files.slax")
            .success(function loadCommandFilesDone (data, status, jqxhr) {

                if (data.files == undefined || data.files.length == 0) {
                    $.dbgpr("load command files: list is empty, ignored");
                    return;
                }

                $.each(commandFilesCleanup, function (i, o) {
                    $.dbgpr("commandFileCleanup: calling " + o.name);
                    o.func();
                });

                $.clira.commands = [ ];
                $.clira.loadBuiltins();

                commandFiles = [ ];
                commandFilesCleanup = [ ];

                // Remove all the old command script files
                $("script.commandFile").remove();

                $.dbgpr("load command files success: " + data.files.length);
                $.each(data.files, function (i, file) {
                    $.clira.addFile(file);
                });
            })
            .fail(function loadCommandFilesFail (jqxhr, settings, exception) {
                $.dbgpr("load command files failed");
            });
        },
        addFile: function addFile (file) {
            commandFiles[file] = file;

            // jQuery's getScript/ajax logic will get a script and
            // eval it, but when there's a problem, you don't get
            // any information about it.  So we use <script>s in the
            // <head> to get 'er done.
            var html = "<scr" + "ipt " + "type='text/javascript'"
                + " class='commandFile'"
                + " src='" + file + "'></scr" + "ipt>";

            $(html).insertBefore("script#last");
        },
        addFileCleanup: function addFileCleanup (name, func) {
            $.dbgpr("addFileCleanup: register " + name);
            commandFilesCleanup.push({ func: func, name: name });
        },
        onload: function onload (name, data) {
            $.dbgpr("clira: load: " + name);
            if ($.isArray(data)) {
                // We have an array of commands
                $.clira.addCommand(data);
            } else if (typeof data == "function") {
                // We have a callback
                data($);
            } else if (typeof data == "object") {
                if (data.command) {
                    // We have a single command (assumably)
                    $.clira.addCommand(data);
                } else {
                    // We have a set of commands (maybe?)
                    $.each(data, $.clira.addCommand);
                }
            }
        },
    });

    function splitTokens (input) {
        return input.trim().split(/\s+/);
    }

    function clone (obj) {
        var newObj = (obj instanceof Array) ? [] : {};
        for (i in obj) {
            if (i == 'clone') continue;
            if (obj[i] && typeof obj[i] == "object") {
                newObj[i] = obj[i];
            } else newObj[i] = obj[i]
        }
        return newObj;
    }

    function contentsAreEqual(a, b) {
        var equal = (a.length == b.length);
        if (equal) {
            $.each(a, function (k, v) {
                if (a[k] != b[k]) {
                    equal = false;
                    return false;
                }
            });
        }
        return equal;
    }

    var parse_id = 1;
    function Parse (base) {
        $.clira.buildObject(this, base, null, { id: parse_id++, });
        this.possibilities = [ ];
        this.debug_log = "";
    }
    $.extend(Parse.prototype, {
        dbgpr: function dbgpr () {
            if ($.clira.debug)
                $.dbgpr(Array.prototype.slice.call(arguments).join(" "));
            else
                this.debug_log += Array.prototype.slice
                    .call(arguments).join(" ") + "\n";
        },
        parse: function parse (inputString) {
            // Attempt a parse of the given input string
            this.input = {
                string: inputString,
                tokens:  splitTokens(inputString),
            }
            var that = this;

            // Create a function with the right "that" in scope.
            // We'll pass this function to the various dump() methods.
            function dbgpr() {
                that.dbgpr(Array.prototype.slice.call(arguments).join(" "));
            }

            // Start with a set of empty possibilities, one for each command
            var possibilities = buildInitialPossibilities();

            // For each input token, look for new possibilities
            $.each(this.input.tokens, function (argn, tok) {
                if (tok.length == 0) // Skip drivel
                    return;

                that.dump(dbgpr, possibilities, "[top] >> ",
                           "top of parse loop for token: '" + tok + "'");

                prev = possibilities;
                possibilities = [ ];

                $.each(prev, function (n, poss) {
                    poss.dump(dbgpr, "[exp] >> ");
                    var newposs = that.newPossibilities(poss, tok, argn);
                    if (newposs && newposs.length > 0) {
                        $.each(newposs, function (n, p) {
                            possibilities.push(p);
                            p.dump(dbgpr, "[new] >> ");
                        });
                    }
                });
            });

            this.possibilities = this.postProcess(possibilities);

            this.dump(dbgpr, this.possibilities,
                      "[pro] >> ", "post process");

            return possibilities.length != 0;
        },
        newPossibilities: function newPossibilities (poss, tok, argn) {
            // newPossibilities: look at the current possibility and the next
            // input token and see if there any possible parses.
            var res = [ ];
            var match;
            var not_seen = true;
            var that = this;

            // Three ways to match a token:
            // - leaf name
            // - value for last leaf
            // - more data for last leaf

            // Check if the previous leaf needs a value
            if (poss.last && poss.last.needs_data) {
                this.dbgpr("argument needs data: " + poss.last.arg.name);
                match = {
                    token: tok,
                    arg: poss.last.arg,
                    data: tok,
                }
                if (poss.last.arg.multiple_words)
                    match.multiple_words = true;

                if (poss.last.arg.enums) {
                    $.each(poss.last.arg.enums, function (n, e) {
                        if ($.clira.lang.match(e.name, tok)) {
                            that.dbgpr("enumeration match for " + e.name);
                            match.enum = e;
                            match.data = e.name;
                            that.addPossibility(res, poss, match,
                                                $.clira.scoring.needs_data
                                                + $.clira.scoring.enum);
                        }
                    });
                } else {

                    // Add a possibility using this match
                    that.addPossibility(res, poss, match,
                                        $.clira.scoring.needs_data);
                }

                // Early return, meaning that data for needs_data won't match
                // normal tokens, which seems reasonable.

                return res;
            }

            // Check for a simple leaf name match
            // Look at each of the command's arguments for a match
            $.each(poss.command.arguments, function (cmdn, arg) {
                // If the argument has been seen already, skip it
                if (poss.seen[arg.name])
                    return;

                // If the name matches the input token, we have a
                // possible parse
                if ($.clira.lang.match(arg.name, tok)) {
                    not_seen = false;
                    match = {
                        token: tok,
                        arg: arg,
                    }

                    // If the argument needs a data value, then mark it as such
                    if ($.clira.types[arg.type] == undefined)
                        $.dbgpr("unknown type: " + arg.type);
                    if ($.clira.types[arg.type].needs_data)
                        match.needs_data = true;

                    // Calculate the score for this possibility
                    var score = $.clira.scoring.name;
                    if (arg.name.length == tok.length)
                        score += $.clira.scoring.name_exact;
                    if (argn == cmdn && $.clira.types[arg.type].order)
                        score += $.clira.types[arg.type].order;

                    // Add a possibility using this match
                    that.addPossibility(res, poss, match, score);
                }

                // Check if the argument is nokeyword and that we haven't
                // seen a keyworded match.
                if (arg.nokeyword && not_seen) {
                    if (poss.seen[arg.name]) // Seen this arg already?
                        return;

                    // Force order onto nokeywords, so that one
                    // can only be seen if all nokeyword arguments
                    // defined previously in the command have values.
                    if (poss.missingPreviousNokeywords(arg))
                        return;

                    match = {
                        token: tok,
                        arg: arg,
                        data: tok,
                        nokeyword: true,
                    }

                    // If the argument allows multiple tokens, mark it as such
                    if (arg.multiple_words)
                        match.multiple_words = true;

                    // Add a possibility using this match
                    that.addPossibility(res, poss, match,
                                        $.clira.scoring.nokeyword);
                }
            });

            // Check if the previous leaf allows multiple values
            if (poss.last && poss.last.multiple_words) {
                this.dbgpr("argument allows multiple words: "
                        + poss.last.arg.name);
                match = {
                    token: tok,
                    arg: poss.last.arg,
                    data: tok,
                    multiple_words: true,
                }

                // Add a possibility using this match
                that.addPossibility(res, poss, match,
                                    $.clira.scoring.multiple_words);
            }

            return res;
        },
        addPossibility: function addPossibility (possibilities, base,
                                                 match_options, score) {
            // Create a new possible parse using the base (previous) parse
            // and the options provided.  Then add that to the list
            // of possibilities.

            var that = this;

            var poss = new Possibility(base);
            poss.score += score;
            if ($.clira.types[match_options.arg.type].score)
                poss.score += $.clira.types[match_options.arg.type].score;

            var match = new Match(match_options);
            poss.addMatch(match);
            poss.last = match;
            if (match.data) {
                if (poss.data[match.arg.name] == undefined)
                    poss.data[match.arg.name] = match.data;
                else
                    poss.data[match.arg.name] += " " + match.data;
            }

            possibilities.push(poss);
            return poss;
        },
        postProcess: function postProcess (list) {
            // We now remove matches that simply don't make sense.
            for (var i = 0; i < list.length; i++) {
                var poss = list[i];
                var whack = false;
                var seen_non_nokeyword = false;

                for (var j = 0; j < poss.matches.length; j++) {
                    var match = poss.matches[j];
                    if (!match.arg.nokeyword)
                        seen_non_nokeyword = true;
                }

                if (!seen_non_nokeyword) {
                    this.dbgpr("all matches are nokeyword; whacking: "
                               + poss.id + ": " + poss.command.command);
                    whack = true;
                } else {
                    for (var j = 0; j < i; j++) {
                        var jp = list[j];
                        if (poss.command == jp.command
                                && contentsAreEqual(poss.data, jp.data)) {
                            this.dbgpr("possibility has already been seen");
                            whack = true;
                            break;
                        }
                    }
                }

                for (var k = 0; k < poss.command.arguments.length; k++) {
                    var arg = poss.command.arguments[k];

                    if (arg.type == "keyword" && !poss.seen[arg.name])
                        poss.score -= $.clira.scoring.missing_keyword;
                }

                // Remove possibilities where all matches are nokeyword
                if (whack)
                    list.splice(i--, 1);
            }

            return list;
        },
        dump: function parseDump (dbgpr, list, indent, tag) {
            dbgpr.call(null, tag);
            var that = this;
            $.each(list, function (n, poss) {
                if (poss.dump)
                    poss.dump(dbgpr, indent);
                else
                    dbgpr.call(null, "invalid poss in possibilities");
            });
        },
        eachPossibility: function eachPossibility (fn) {
            $.each(this.possibilities, function (n, p) {
                fn.call(this, n, p);
            });
        },
    });

    var poss_id = 1;
    function Possibility (base) {
        $.clira.buildObject(this, base, null, { id: poss_id++, });

        /* We need our own copy of the matches and data */
        this.matches = clone(base.matches);
        this.data = clone(base.data);
        this.seen = clone(base.seen);
    }
    $.extend(Possibility.prototype, {
        dump: function (dbgpr, indent) {
            dbgpr.call(null, indent + "Possibility: " + this.id
                       + " command [" + this.command.command + "] "
                       + this.score);
            $.each(this.matches, function (x, m) {
                m.dump(dbgpr, indent + "  ");
            });
            if (this.data)
                dbgpr.call(null, indent
                           + "   Data: {" + dump(this.data) + "}");
            if (this.seen)
                dbgpr.call(null, indent
                           + "   Seen: {" + dump(this.seen) + "}");
        },
        addMatch: function addMatch (match) {
            this.seen[match.arg.name] = true;
            this.matches.push(match);
        },
        allMatchesAreNokeyword: function allMatchesAreNokeyword () {
            for (var i = 0; i < this.matches.length; i++)
                if (!this.matches[i].arg.nokeyword)
                    return false;
            return true;
        },
        missingPreviousNokeywords: function missingPreviousNokeywords (arg) {
            // See if any nokeyword arguments defined before 'arg'
            // in the current command are missing.
            for (var i = 0; i < this.command.arguments.length; i++) {
                var a = this.command.arguments[i];
                if (a.name == arg.name)
                    break;
                if (a.nokeyword && this.seen[a.name] == undefined)
                    return true;
            }
            return false;
        },
        eachMatch: function eachMatch (fn) {
            $.each(this.matches, function eachMatchCb (n, m) {
                fn.call(this, n, m);
            });
        },
        eachData: function eachData (fn) {
            $.each(this.data, function eachDataCb (n, m) {
                fn.call(this, n, m);
            });
        },
        eachSeen: function eachSeen (fn) {
            $.each(this.seen, function eachSeenCb (n, m) {
                fn.call(this, n, m);
            });
        },
    });

    var match_id = 1;
    function Match (base) {
        $.clira.buildObject(this, base, { },
                    { id: match_id++, });
    }
    $.extend(Match.prototype, {
        dump: function dumpMatch(dbgpr, indent) {
            dbgpr.call(null, indent + "Match: " + this.id
                    + " [" + this.token + "] -> " + this.arg.name
                       + (this.data ? " data" : "")
                       + (this.needs_data ? " needs_data" : "")
                       + (this.multiple_words ? " multiple_words" : ""));
        },
    });

    function buildInitialPossibilities () {
        var possibilities = [ ];
        $.each($.clira.commands, function (n, c) {
            var p = new Possibility({
                command: c,
                matches: [ ],
                score: 0,
            });
            possibilities.push(p);
        });
        return possibilities;
    }

    $.clira.parse = function parse (inputString, options) {
        var p = new Parse(options);
        p.parse(inputString);
        p.possibilities.sort(function sortPossibilities (a, b) {
            return b.score - a.score;
        });
        return p;
    }

    function dump (obj) {
        var s = " ";
        $.each(obj, function (key, value) {
            s += "'" + key + "': '" + value + "', ";
        });
        return s;
    }

    Parse.prototype.render = function renderParse (opts) {
        var parse = this;
        var res = "<div class='parse'>"
            + "<div class='input-debug'>Input: "
            + parse.input.string + "</div>";
        var that = this;

        parse.eachPossibility(function (x, p) {
            p.render(that, opts);
            res += p.html;
        });

        res += "</div>";

        return res;
    }

    function commandToken(poss, match, token, value) {
        var res = "";
        if (match.nokeyword)
            res = "<div class='parse-implicit-keyword'>"
            + match.arg.name + "</div> ";

        res += "<div class='parse-token'>" + token + "</div>";

        var trailing = value.substring(token.length);
        if (trailing)
            res += "<div class='parse-trailing'>" + trailing + "</div>";

        return res;
    }

    function renderAsText (html) {
        var res = "";
        for (;;) {
            var s = html.indexOf("<");
            if (s < 0)
                break;
            var e = html.indexOf(">", s);
            if (s != 0)
                res += html.substring(0, s);
            html = html.substring(e + 1);
        }
        res += html;
        return res;
    }

    Possibility.prototype.render = function renderPossibility (parse, opts) {
        var details = "";
        var html = "<div class='possibility'>";
        html += "<div class='command-line'>";
        var poss = this;

        if (opts == undefined)
            opts = { };

        if (opts.details) {
            details = "<div class='details'>Possibility Id: " + this.id
                + ", Score: " + this.score
                + ", Command: '" + this.command.command + "'</div>";
            details += "<div class='details'>";
        }

        var emitted = { };

        this.eachMatch(function eachMatch (x, m) {
            var title = "Id: " + m.id + " " + m.arg.name
                + " (" + m.arg.type + ")";
            if (m.enum)
                title += " (" + m.enum.name + ")";
            if (m.data)
                title += " data";
            if (m.needs_data)
                title += " needs_data";
            if (m.multiple_words)
                title += " multiple_words";

            if (opts.details) {
                details += "<div class='match-details' title='" + title
                    + "'>" + m.token + "</div> ";
            }

            html += emitMissingTokens(poss, m, emitted, false);

            html += "<div class='command-token' title='" + title + "'>";

            var full = m.enum ? m.enum.name : m.data ? "" : m.arg.name;

            html += commandToken(poss, m, m.token, full);
            html += "</div> ";
        });

        html += emitMissingTokens(this, null, emitted, true);

        html += "</div>";
        if (opts.details) {
            details += "</div>";
            details += "<div class='details'>Data: {" + dump(this.data)
                + "}, Seen: {" + dump(this.seen) + "}</div>";
            html += "<div class='parse-details'>" + details + "</div>";
        }

        html += "</div>";

        this.html = html;
        var text = renderAsText(html);
        this.text = text;
        return text;
    }

    // If there are missing token (keywords) then emit them now.
    function emitMissingTokens (poss, match, emitted, final) {
        var res = "";
        var all_keywords = true;

        $.each(poss.command.arguments, function (n, arg) {
            // Stop when we hit the current match
            if (match && arg == match.arg)
                return false;

            // If we've already emitted it, skip
            if (emitted[arg.name])
                return true;

            if (arg.mandatory && !poss.seen[arg.name]) {
                res += "<div class='parse-mandatory'>" + arg.name + "</div> ";
                res += "<div class='parse-mandatory-value'>"
                    + arg.name + "</div> ";
                emitted[arg.name] = true;
            }

            // If it's a keyword that we haven't seen, emit it
            if (arg.type == "keyword" && !poss.seen[arg.name]) {
                res += "<div class='parse-missing'>" + arg.name + "</div> ";
                emitted[arg.name] = true;
            }
        });

        return res;
    }
});
