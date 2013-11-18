/**
 * @fileoverview
 * @author Taketshi Aono
 */
'use strict';

var path = require('path');
var util = require('util');
var sinon = require('sinon');
var assert = require('assert');
var SEP = /\\/g;

/**
 * @constructor
 */
function VirtualEntries(opt_entries) {
  this._entries = {};
  this._files = {};
  this._root = process.cwd().replace(SEP, '/');
  this._entries[this._root] = module.exports.createDir(this._root);
  if (opt_entries) {
    this.add(opt_entries);
  }
}


VirtualEntries.prototype.add = function(entries) {
  if (!Array.isArray(entries)) {
    entries = [entries];
  }
  this._entries[this._root].addChild(entries);
  for (var i = 0, len =  entries.length; i < len; i++) {
    this._add(path.resolve(this._root, entries[i].getName()), entries[i]);
  }
};


VirtualEntries.prototype.getRealpath = function(name) {
  return path.resolve(this._root, name);
};


VirtualEntries.prototype.hasEntry = function(name) {
  name = name.replace(SEP, '/');
  var resolved = path.resolve(this._root, name);
  return resolved in this._entries;
};


VirtualEntries.prototype.getEntry = function(name) {
  name = name.replace(SEP, '/');
  var resolved = path.resolve(this._root, name);
  assert.ok(resolved in this._entries, 'ENOENT ' + name + ' no such file or directory.');
  return this._entries[resolved];
};


VirtualEntries.prototype.getEntries = function() {
  return this._entries;
};


/**
 * filesの取得
 * @return {Object.<string,Entry>} files
 */
VirtualEntries.prototype.getFiles = function() {
  return this._files;
};



VirtualEntries.prototype._add = function(name, entry) {
  if (!(name in this._entries)) {
    this._entries[name] = entry;
  }
  if (entry.isDirectory()) {
    var content = entry.getEntries();
    for (var i = 0, len = content.length; i < len; i++) {
      var next = name + '/' + content[i].getName();
      this._add(path.resolve(this._root, next), content[i]);
    }
  } else {
    this._files[name] = entry;
  }
};


/**
 * @constructor
 */
function Entry() {}


/**
 * @returns {boolean}
 */
Entry.prototype.isFile = function() {
  return this._isFile;
};


/**
 * @returns {boolean}
 */
Entry.prototype.isDirectory = function() {
  return this._isDirectory;
};


/**
 * @private {boolean}
 */
Entry.prototype._isFile = false;


/**
 * @private {boolean}
 */
Entry.prototype._isDirectory = false;


/**
 * @constructor
 * @extends {Entry}
 * @param {string} name
 * @param {Array.<(Directory|File)>} entries
 */
function Directory(args) {
  this._name = args.shift();
  this._entries = args;
  this._isDirectory = true;
}
util.inherits(Directory, Entry);


Directory.prototype.getName = function() {
  return this._name;
};


Directory.prototype.getEntries = function() {
  return this._entries;
};


Directory.prototype.addChild = function(entries) {
  var args = Array.prototype.slice.call(arguments);
  this._entries = this._entries.concat(args);
  return this;
};


/**
 * @constructor
 * @extends {Entry}
 * @param {string} name
 * @param {string} content
 */
function File(args) {
  this._name = args[0];
  this._content = this._createContent(args[1]);
  this._isFile = true;
}
util.inherits(File, Entry);


/**
 * nameの取得
 * @return {string} name
 */
File.prototype.getName = function() {
  return this._name;
};


/**
 * contentの取得
 * @return {tring} content
 */
File.prototype.getContent = function() {
  return this._content;
};


/**
 * contentの設定
 * @param {string} content
 */
File.prototype.setContent = function(content) {
  this._content = content;
};



File.prototype._createContent = function(content) {
  if (Object.prototype.toString.call(content) === '[object Object]') {
    return JSON.stringify(content);
  }
  return content || '';
};


/**
 * @constructor
 * @param {VirtualEntries} entries
 */
function Filesystem(entries) {
  this._entries = entries;
  this.resetSpies();
};


/**
 * @param {VirtualEntries} entries
 */
Filesystem.prototype.resetSpies = function(entries) {
  this.mkdirSync = sinon.spy();

  entries = (entries || this._entries);
  this.statSync = sinon.spy(function(path) {
    return {
      isDirectory : function() {
        return entries.getEntry(path).isDirectory();
      }.bind(this)
    };
  });

  this.stat = sinon.spy(function(path, cb) {
    cb({
      isDirectory : function() {
        return entries.getEntry(path).isDirectory();
      }.bind(this)
    });
  });

  this.readdirSync = sinon.spy(function(path) {
    var ent = entries.getEntry(path);
    assert.ok(ent.isDirectory(), path + ' is not a directory');
    return ent.getEntries().map(function(ent) {
      return ent.getName();
    });
  });

  this.readdirSync = sinon.spy(function(path, cb) {
    var ent = entries.getEntry(path);
    assert.ok(ent.isDirectory(), path + ' is not a directory');
    cb(ent.getEntries().map(function(ent) {
      return ent.getName();
    }));
  });

  this.realpathSync = sinon.spy(function(path) {
    return entries.getRealpath(path);
  });

  this.realpath = sinon.spy(function(path, cb) {
    cb(entries.getRealpath(path));
  });

  this.readFileSync = sinon.spy(function(path, encoding) {
    var ent = entries.getEntry(path);
    assert.ok(ent.isFile(), 'ENOENT ' + path + ' no such file.');
    return ent.getContent();
  });

  this.readFile = sinon.spy(function(path, encoding, cb) {
    var ent = entries.getEntry(path);
    assert.ok(ent.isFile(), 'ENOENT ' + path + ' no such file.');
    cb(ent.getContent());
  });

  this.writeFileSync = sinon.spy(function(path, content, encoding) {
    var ent = entries.getEntry(path);
    assert.ok(ent.isFile(), 'ENOENT ' + path + ' no such file.');
    ent.setContent(content);
  });

  this.writeFile = sinon.spy(function(path, content, encoding, cb) {
    var ent = entries.getEntry(path);
    assert.ok(ent.isFile(), 'ENOENT ' + path + ' no such file.');
    cb(ent.setContent(content));
  });
};


module.exports = {
  Filesystem : Filesystem,
  VirtualEntries : VirtualEntries,
  createDir : function(name, entries) {
    return new Directory(Array.prototype.slice.call(arguments));
  },
  createFile : function(name, content) {
    return new File(Array.prototype.slice.call(arguments));
  }
}