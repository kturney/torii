import UUIDGenerator from 'torii/lib/uuid-generator';
import PopupIdSerializer from 'torii/lib/popup-id-serializer';
import ParseQueryString from 'torii/lib/parse-query-string';
//import {stringifyOptions, prepareOptions, parseMessage} from 'torii/helpers/services-helper';
export var CURRENT_REQUEST_KEY = '__torii_request';

var on = Ember.on;



function parseMessage(url, keys){
  var parser = ParseQueryString.create({url: url, keys: keys}),
      data = parser.parse();
  return data;
}



var ServicesMixin = Ember.Mixin.create({

  init: function(options){
    // may not need these next two lines : https://github.com/Vestorly/torii/commit/f5531d325b95df825ae763ef064c5acc36be8858#diff-8b7b6e15c618f576b36e529bef3c661bL51
    //this._super.apply(this, arguments);
    //options = options || {};
    this.remoteIdGenerator = options.remoteIdGenerator || UUIDGenerator;
  },

  // Open a remote window. Returns a promise that resolves or rejects
  // accoring to if the iframe is redirected with arguments in the URL.
  //
  // For example, an OAuth2 request:
  //
  // iframe.open('http://some-oauth.com', ['code']).then(function(data){
  //   // resolves with data.code, as from http://app.com?code=13124
  // });
  //
  // Services that use this mixin should implement openRemote
  //
  open: function(url, keys, options){
    var service   = this,
        lastRemote = this.remote;


    return new Ember.RSVP.Promise(function(resolve, reject){
      if (lastRemote) {
        service.close();
      }

      var remoteId = service.remoteIdGenerator.generate();

      
      var pendingRequestKey = PopupIdSerializer.serialize(remoteId);
      localStorage.setItem(CURRENT_REQUEST_KEY, pendingRequestKey);


      service.openRemote(url, pendingRequestKey, options);

      if (service.remote && !service.remote.closed) {
        service.remote.focus();
      } else {
        reject(new Error(
          'iframe could not open or was closed'));
        return;
      }

      service.one('didClose', function(){
        var pendingRequestKey = localStorage.getItem(CURRENT_REQUEST_KEY);
        if (pendingRequestKey) {
          localStorage.removeItem(pendingRequestKey);
          localStorage.removeItem(CURRENT_REQUEST_KEY);
        }
        // If we don't receive a message before the timeout, we fail. Normally,
        // the message will be received and the window will close immediately.
        service.timeout = Ember.run.later(service, function() {
          reject(new Error("iframe was closed, authorization was denied, or a authentication message otherwise not received before the window closed."));
        }, 100);
      });

      Ember.$(window).on('storage.torii', function(event){
        var storageEvent = event.originalEvent;

        var remoteIdFromEvent = PopupIdSerializer.deserialize(storageEvent.key);
        if (remoteId === remoteIdFromEvent){
          var data = parseMessage(storageEvent.newValue, keys);
          localStorage.removeItem(storageEvent.key);
          Ember.run(function() {
            resolve(data);
          });
        }
      });

      service.schedulePolling();

    }).finally(function(){
      // didClose will reject this same promise, but it has already resolved.
      service.close();
      service.clearTimeout();
      Ember.$(window).off('storage.torii');
    });
  },

  pollRemote: function(){
    if (!this.remote) {
      return;
    }
    if (this.remote.closed) {
      this.trigger('didClose');
    }
  },

  schedulePolling: function(){
    this.polling = Ember.run.later(this, function(){
      this.pollRemote();
      this.schedulePolling();
    }, 35);
  },

  // Clear the timeout, in case it hasn't fired.
  clearTimeout: function(){
    Ember.run.cancel(this.timeout);
    this.timeout = null;
  },

  stopPolling: on('didClose', function(){
    Ember.run.cancel(this.polling);
  }),

});

export default ServicesMixin;