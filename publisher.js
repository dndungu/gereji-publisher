"use strict";

var fs = require('fs');
var zlib = require("zlib");

module.exports = function(){

	var self = {};

	return {
		init: function(){
			self.statusCode = 200;
			self.headers = {};
			self.body = {};
			return this;
		},
		push: function(module, handler, content){
            self.body[module] = self.body[module] ? self.body[module] : {};
            self.body[module][handler] = content;
            return this;		
		},
		write: function(context){
			this.writeHead(context);
			this.writeContent(context);
		},
		writeHead: function(context){
            var response = context.get("response");
            if(response.headersSent)
                return this;
            if(!this.header("content-encoding"))
                this.header("content-encoding", this.encoding(context));
            if(!this.header("content-type"))
                this.header("content-type", this.type(context));
            var cookies = context.get("cookies").toSetCookieString();
            if(cookies)
                this.header("set-cookie", cookies);
            response.writeHead(this.statusCode(), this.headers());
            return this;	
		},
		writeContent: function(context){
			var response = context.get("response");
			var stream = this.stream(context);
			switch(this.encoding(context)){
				case "gzip":
					var gzip = zlib.createGzip();
					stream.pipe(gzip).pipe(response);
					break;
				case "deflate":
					var deflate = zlib.createDeflate();
					stream.pipe(deflate).pipe(response);
					break;
				default:
					stream.pipe(response);
					break;
			}
			return this;
		},
        statusCode: function(statusCode){
            if(statusCode)
                self.statusCode = statusCode;
            return self.statusCode;
        },
        header: function(){
            var key = arguments[0].toLowerCase();
            var value = arguments[1];
            if(value)
                self.headers[key] = value;
            else
                return self.headers[key];
            return this;
        },
        headers: function(){
            return self.headers;
        },
        stream: function(context){
            var route = context.get('route');
            var type = route ? route.type : null;
            switch(type){
                case "json":
                    return this.streamJSON(context);
                case "xml":
                    return this.streamXML();
                case "html":
                    return this.streamHTML(context);
                default:
                    return this.streamText();
            }
        },
        streamJSON: function(context){
			var that = this;
            var stream = new (require('stream'));
            stream.pipe = function(reader, options){
                if(!options)
                    options = {end : true};
				if(context.get("route").sync)
	                reader.write(JSON.stringify(self.body, null, 4));
				else
					reader.write(JSON.stringify(that.toArray(), null, 4));
                if(options.end)
                    reader.end();
                reader.end();
                return reader;
            };
            return stream;
        },
        streamXML: function(){
            var transform = function(content){
                var xml = [];
                for(var i in content){
                    var name = isNaN(i) ? i : 'node-' + String(i);
                    var value = ['number', 'boolean', 'string'].indexOf(typeof content[i]) == -1 ? transform(content[i]) : String(content[i]);
                    xml.push('<' + name + '>' + value + '</' + name + '>');
                }
                return xml;
            };
            var stream = new (require('stream'));
            stream.pipe = function(reader, options){
				if(!options)
					options = {end : true};
                var xml = transform({data : self.body});
                xml.unshift('<?xml version="1.0"?>');
                reader.write(xml.join("\n"));
				if(options.end)
                	reader.end();
                return reader;
            };
            return stream;
        },
        streamHTML: function(context, options){
            try{
                var jar = context.get("settings").path + "lib/saxon/saxon9he.jar";
                var saxon = require('saxon-stream2');
                var xml = this.streamXML();
				var xsl = this.xsl(context);
				var xslt = saxon(jar, xsl, { timeout : 5000 });
				return xml.pipe(xslt, options);
            }catch(error){
				//TODO
            }
        },
		streamText: function(){
			var toArray = this.toArray;
			var stream = new (require('stream'));
			stream.pipe = function(reader, options){
				if(!options)
					options = {end : true};
                reader.write(toArray().join('\n'));
				if(options.end)
	                reader.end();
                return reader;				
			};
			return stream;
		},
		toArray: function(){
			var text = [];
			for(var i in self.body){
				for(var j in self.body[i]){
					text.push(self.body[i][j]);
				}
			}
			return text;			
		},
		xsl: function(context){
			var template = [];
			template.push(context.get("settings").path.replace(/\/$/, ""));
			template.push('templates');
			template.push(context.get('site').settings.theme);
			template.push(context.get('route').stylesheet);
			var xsl = template.join("/");
			if(fs.existsSync(xsl))
				return xsl;
			template[3] = "settings.json";
			var settings = require(template.join("/"));
			template[2] = settings.inherits;
			template[3] = context.get('route').stylesheet;
			return template.join("/");
		},
        type: function(context){
			var route = context.get('route');
			var type = route ? route.type : null;
            return type == "xml" ? "application/xml" : type == "html" ? "text/html" : type == "json" ? "application/json" : "text/plain";
        },
        encoding: function(context){
            var accept = String(context.get("request").headers["accept-encoding"]);
            var encoding = "identity";
            if(accept.indexOf("deflate") != -1)
                encoding = "deflate";
            if(accept.indexOf("gzip") != -1)
                encoding = "gzip";
            return encoding;
        }
	};
};
