'use strict';

const util = require('util');
const EventEmitter = require('events');
const MongoOplog = require('mongo-oplog');

function Mongo(cfg) {
    var connString;

    cfg = cfg || {};

    EventEmitter.call(this);

    if (!cfg.connString) {
        connString = 'mongodb://';
        if (cfg.username && cfg.password) {
            connString += cfg.username + ':' + cfg.password  + '@';
        }

        connString += cfg.hostname || cfg.host || '127.0.0.1';

        if (cfg.port) {
            connString += ':' + cfg.port;
        }

        connString += '/' + (cfg.database || 'admin');

        if (cfg.replicaSet) {
            connString += '?replicaSet=' + cfg.replicaSet;
        }

        this.connString = connString;
    }

    // In V8, reading a boolean value ste 8.7x slower to lookup an undefined property than to read a boolean value, so we'll explicitly values.

    Object.defineProperty(this, "_emitEvents", {
        enumerable: false,
        writable: true
    });

    this._emitEvents = (typeof cfg.emitEvents === 'boolean') ? cfg.emitEvents : true;

    this.emitInsert = (typeof cfg.emitInsert === 'boolean') ? cfg.emitInsert : this._emitEvents;
    this.emitUpdate = (typeof cfg.emitUpdate === 'boolean') ? cfg.emitUpdate : this._emitEvents;
    this.emitDelete = (typeof cfg.emitDelete === 'boolean') ? cfg.emitDelete : this._emitEvents;
    this.emitEvent =  (typeof cfg.emitEvent === 'boolean') ? cfg.emitEvent : this._emitEvents;
    this.emitError = (typeof cfg.emitEvent === 'boolean') ? cfg.emitEvent : true;

    this.onInsert = (typeof cfg.onInsert === 'function') ? cfg.onInsert.bind(this) : false;
    this.onUpdate = (typeof cfg.onUpdate === 'function') ? cfg.onUpdate.bind(this) : false;
    this.onDelete = (typeof cfg.onDelete === 'function') ? cfg.onDelete.bind(this) : false;
    this.onEvent =  (typeof cfg.onEvent === 'function')  ? cfg.onEvent.bind(this)  : false;
    this.onError =  (typeof cfg.onError === 'function')  ? cfg.onError.bind(this)  : false;

    if (this.emitError || this.onError) {
        // TODO: Look into how oplog handles errors
    }

    Object.defineProperty(this, '_onEventsWrapper', {
        enumerable: false,
        writable: true
    });

    this._onEventsWrapper = (typeof cfg.onEventsWrapper === 'function') ? cfg.onEventsWrapper : false;

    this.onInsertWrapper = (typeof cfg.onInsertWrapper === 'function') ? cfg.onInsertWrapper : this._onEventsWrapper;
    this.onUpdateWrapper = (typeof cfg.onUpdateWrapper === 'function') ? cfg.onUpdateWrapper : this._onEventsWrapper;
    this.onDeleteWrapper = (typeof cfg.onDeleteWrapper === 'function') ? cfg.onDeleteWrapper : this._onEventsWrapper;
    this.onEventWrapper  = (typeof cfg.onEventWrapper === 'function')  ? cfg.onEventWrapper : this._onEventsWrapper;
}

// This line must appear before anything is added to the Mongo prototype
util.inherits(Mongo, EventEmitter);

Object.defineProperty(Mongo.prototype, 'onEventsWrapper', {
    set: function (val) {
        val = (typeof val === 'function') ? val : false;

        this.onInsertWrapper = (this.onInsertWrapper === this._onEventsWrapper) ? val : this.onInsertWrapper;
        this.onDeleteWrapper = (this.onDeleteWrapper === this._onEventsWrapper) ? val : this.onDeleteWrapper;
        this.onUpdateWrapper = (this.onUpdateWrapper === this._onEventsWrapper) ? val : this.onUpdateWrapper;
        this.onEventWrapper  = (this.onEventWrapper  === this._onEventsWrapper) ? val : this.onEventWrapper;

        this._onEventsWrapper = val;
    },

    get: function () {
        return this._onEventsWrapper;
    }
});

Object.defineProperty(Mongo.prototype, 'emitEvents', {
    set: function (val) {
        this.emitInsert = val;
        this.emitUpdate = val;
        this.emitDelete = val;
        this.emitEvent = val;

        this._emitEvents = val;
    },

    get: function () {
        return !!this._emitEvents;
    }
});

Mongo.prototype.init = function init(cb) {
    var oplog = MongoOplog('mongodb://127.0.0.1:27017/lapidus?replicaSet=rs0'),
        self = this;

    oplog.on('error', function (error) {
       self.emit('error', error);
    });

    oplog.on('end', function () {
        self.emit('end');
    });

    this.oplog = oplog;

    cb && cb(null, {});
};

Mongo.prototype.start = function(cb) {
    var oplog = this.oplog,
        self = this;

    if (!oplog) {
        cb(new Error('You must call .init() before you call .start()'), null);
    }

    oplog.on('insert', function (doc) {
        var o = doc.o,
            o2 = doc.o2,
            ns = doc.ns;

        var event = {
            pk: o._id || o2._id,
            ns: ns,
            item: o
        };

        if (self.onInsert) {
            if (self.onInsertWrapper) {
                self.onInsertWrapper(function() {
                    self.onInsert(event, doc);
                });
            } else {
                self.onInsert(event, doc);
            }
        }

        if (self.onEvent) {
            event.type = 'insert';

            if (self.onEventWrapper) {
                self.onEventWrapper(function() {
                    self.onEvent(event, doc);
                });
            } else {
                self.onEvent(event, doc);
            }
        }

       delete event.type;

        self.emitInsert && self.emit('insert', event);

        if (self.emitEvent) {
            event.type = 'insert';
            self.emit('event', event);
        }
    });

    /* Update operator reference
         $inc	      Increments the value of the field by the specified amount.
         $mul	      Multiplies the value of the field by the specified amount.
         $rename	  Renames a field.
         $setOnInsert Sets the value of a field if an update results in an insert of a document. Has no effect on
                      update operations that modify existing documents.
         $set	      Sets the value of a field in a document.
         $unset	      Removes the specified field from a document.
         $min	      Only updates the field if the specified value is less than the existing field value.
         $max	      Only updates the field if the specified value is greater than the existing field value.
         $currentDate Sets the value of a field to current date, either as a Date or a Timestamp.
    */

    oplog.on('update', function (doc) {
        var o = doc.o,
            o2 = doc.o2,
            ns = doc.ns;

        var event = {
            pk: o._id || o2._id,
            ns: ns,
            item: o2 || o
        };

        if (self.onUpdate) {
            if (self.onUpdateWrapper) {
                self.onUpdateWrapper(function() {
                    self.onUpdate(event, doc);
                });
            } else {
                self.onUpdate(event, doc);
            }
        }

        if (self.onEvent) {
            event.type = 'update';

            if (self.onEventWrapper) {
                self.onEventWrapper(function() {
                    self.onEvent(event, doc);
                });
            } else {
                self.onEvent(event, doc);
            }
        }

        delete event.type;

        self.emitUpdate && self.emit('update', event);

        if (self.emitEvent) {
            event.type = 'update';
            self.emit('event', event);
        }
    });

    oplog.on('delete', function (doc) {
        var o = doc.o,
            o2 = doc.o2,
            ns = doc.ns;

        var event = {
            pk: o._id || o2._id,
            ns: ns
        };

        if (self.onDelete) {
            if (self.onDeleteWrapper) {
                self.onDeleteWrapper(function() {
                    self.onDelete(event, doc);
                });
            } else {
                self.onDelete(event, doc);
            }
        }

        if (self.onEvent) {
            event.type = 'delete';

            if (self.onEventWrapper) {
                self.onEventWrapper(function() {
                    self.onEvent(event, doc);
                });
            } else {
                self.onEvent(event, doc);
            }
        }

        delete event.type;

        self.emitDelete && self.emit('delete', event);

        if (self.emitEvent) {
            event.type = 'delete';
            self.emit('event', event);
        }
    });

    if (typeof cb === 'function') {
        oplog.tail(function(err, conn) {
            if (err) {
                throw err;
            }

            self.conn = conn;
            cb && cb(err, conn);
        });
    } else {
        oplog.tail();
    }
};

Mongo.prototype.stop = function(cb) {
    if (!this.oplog) {
        cb(new Error('You must call .init() before you call .stop()'), null);
    }

    if (typeof cb === 'function') {
        this.oplog.stop(cb);
    } else {
        this.oplog.stop();
    }
};

Mongo.prototype.validateConfig = function() {
};

module.exports = Mongo;