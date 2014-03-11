exports.install = function(self)
{
  self.TSockets = {};
  self.socket = function(uri, callback)
  {
    if(typeof uri != "string") return warn("invalid TS uri")&&false;
    // detect connecting socket
    if(uri.indexOf("ts://") == 0)
    {
      var parts = uri.substr(5).split("/");
      var to = self.whois(parts.shift());
      if(!to) return warn("invalid TS hashname")&&false;
      return to.socket(parts.join("/"));
    }
    if(uri.indexOf("/") != 0) return warn("invalid TS listening uri")&&false;
    debug("adding TS listener",uri)
    self.TSockets[uri] = callback;
  }
	self.rels["ts"] = function(err, packet, chan, callback)
  {
    if(err) return;
    var self = packet.from.self;
    callback();

    // ensure valid request
    if(typeof packet.js.path != "string" || !self.TSockets[packet.js.path]) return chan.err("unknown path");
  
    // create the socket and hand back to app
    chan.wrap("TS");
    self.TSockets[packet.js.path](chan.socket);
    chan.send({js:{open:true}});
  }

  
  self.channelWraps["TS"] = function(chan){
    chan.socket = {data:"", hashname:chan.hashname, id:chan.id};
    chan.callback = function(err, packet, chan, callback){
      // go online
      if(chan.socket.readyState == 0)
      {
        chan.socket.readyState = 1;
        if(chan.socket.onopen) chan.socket.onopen();
      }
      if(packet.body) chan.socket.data += packet.body;
      if(packet.js.done)
      {
        // allow ack-able onmessage handler instead
        if(chan.socket.onmessageack) chan.socket.onmessageack(chan.socket, callback);
        else callback();
        if(chan.socket.onmessage) chan.socket.onmessage(chan.socket);
        chan.socket.data = "";
      }else{
        callback();
      }
      if(err)
      {
        chan.socket.readyState = 2;
        if(err != true && chan.socket.onerror) chan.socket.onerror(err);
        if(chan.socket.onclose) chan.socket.onclose();
      }
    }
    // set up TS object for external use
    chan.socket.readyState = chan.lastIn ? 1 : 0; // if channel was already active, set state 1
    chan.socket.send = function(data, callback){
      if(chan.socket.readyState != 1) return debug("sending fail to TS readyState",chan.socket.readyState)&&false;
      // chunk it
      while(data)
      {
        var chunk = data.substr(0,1000);
        data = data.substr(1000);
        var packet = {js:{},body:chunk};
        // last packet gets confirmed/flag
        if(!data)
        {
          packet.callback = callback;
          packet.js.done = true;
        }
        debug("TS SEND",chunk.length,packet.js.done);
        chan.send(packet);
      }
    }
    chan.socket.close = function(){
      chan.socket.readyState = 2;
      chan.done();
    }    
  }
}