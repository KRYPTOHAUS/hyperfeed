const FeedParser = require('feedparser')
const FeedGen = require('feed')
const toStream = require('string-to-stream')
const async = require('async')
const toString = require('stream-to-string')
const request = require('request')
const moment = require('moment')
const uuid = require('uuid')
const through2 = require('through2')

function Feed (drive, key, opts) {
  if (!(this instanceof Feed)) return new Feed(drive, key, opts)

  if (typeof key === 'object' && !Buffer.isBuffer(key) && key) {
    opts = key
    key = null
  }

  if (!opts) opts = {}
  if (key && opts.own === undefined) throw (new Error('need to explicit specify ownership if key is given'))

  this.scrap = opts.scrap
  this._drive = drive
  this.own = key ? !!opts.own : true

  var archiveOpts = {live: true, sparse: true}
  if (opts.file) archiveOpts.file = opts.file
  if (key) {
    this._archive = this._drive.createArchive(key, archiveOpts)
  } else {
    this._archive = this._drive.createArchive(archiveOpts)
  }
  this.key = this._archive.key
  this.id = this._archive.id
  this.discoveryKey = this._archive.discoveryKey
}

Feed.prototype.replicate = function (opts) {
  return this._archive.replicate(opts)
}

Feed.prototype.update = function (feed) {
  var self = this
  return new Promise((resolve, reject) => {
    if (!this.own) return reject(new Error("can't update archive you don't own"))
    var feedparser = new FeedParser()
    toStream(feed).pipe(feedparser)

    var tasks = []
    feedparser.on('error', e => reject(e))
    feedparser.on('meta', meta => {
      this.meta = meta

      tasks.push((cb) => {
        var ws = self._archive.createFileWriteStream('_meta')
        toStream(JSON.stringify(meta)).pipe(ws).on('finish', cb)
      })
    })
    feedparser.on('readable', function () {
      var readable = this
      var item

      while ((item = readable.read())) {
        tasks.push(_save(item))
      }
    })
    feedparser.on('end', function () {
      async.series(tasks, (err) => {
        if (err) return reject(err)
        resolve(self)
      })
    })
  })

  function _save (item) {
    return (cb) => {
      self.save(item).then(() => { cb() }).catch(err => { cb(err) })
    }
  }
}

Feed.prototype.setMeta = function (meta) {
  var self = this
  self.meta = meta

  return new Promise((resolve, reject) => {
    var ws = self._archive.createFileWriteStream('_meta')
    toStream(JSON.stringify(meta)).pipe(ws).on('finish', () => { resolve(self) })
  })
}

Feed.prototype.list = function (opts, cb) {
  if (typeof opts === 'function') {
    cb = opts
    opts = {}
  }

  if (!opts) opts = {}
  if (!opts.live) opts.live = false

  var rs = through2.obj(function (obj, enc, next) {
    if (obj.name !== '_meta' && (opts.withScrapped || !obj.name.startsWith('scrap/'))) this.push(obj)
    next()
  })
  var finalize = (cb) => {
    if (this.own) {
      this._archive.finalize(cb)
    } else {
      cb()
    }
  }
  finalize(() => {
    if (cb) {
      this._archive.list(opts, (err, results) => {
        if (err) return cb(err)

        cb(null, results.filter(x => { return x.name !== '_meta' && (opts.withScrapped || !x.name.startsWith('scrap/')) }))
      })
    } else {
      this._archive.list(opts).pipe(rs)
    }
  })
  return rs
}

Feed.prototype.xml = function (count) {
  return new Promise((resolve, reject) => {
    this.list((err, entries) => {
      if (err) return reject(err)
      if (entries.length > count) {
        entries = entries.sort(byCTimeDESC).slice(0, 10)
      }
      var tasks = []
      entries.forEach(e => { tasks.push(this._load(e)) })

      async.series(tasks, (err, results) => {
        if (err) return reject(err)
        buildXML(this._archive, this.meta, results).then(xml => resolve(xml))
      })
    })
  })
}

Feed.prototype.save = function (item, targetEntry, scrappedData) {
  if (!item.guid) item.guid = uuid.v1()
  if (!item.date) item.date = new Date()

  var feed = this
  return new Promise((resolve, reject) => {
    feed.list((err, entries) => {
      if (err) return reject(err)
      if (entries.find(x => x.name === item.guid)) return resolve() // ignore duplicated entry
      if (!item.guid) return reject(new Error('GUID not found'))

      var to
      if (targetEntry) {
        to = feed._archive.createFileWriteStream(targetEntry)
      } else {
        to = feed._createWriteStream(item)
      }
      toStream(JSON.stringify(item)).pipe(to).on('finish', done)
    })

    function done () {
      if (scrappedData) return feed._saveScrapped(item, scrappedData)(resolve)
      if (feed.scrap) return feed._scrap(item)(resolve)

      return resolve()
    }
  })
}

Feed.prototype._scrap = function (item) {
  var self = this
  return (cb) => {
    var url = item.url || item.link
    request(url, (err, resp, body) => {
      if (err) return cb(err)
      if (resp.statusCode !== 200) return cb(new Error('invalid status code'))

      self._saveScrapped(item, body)(cb)
    })
  }
}

Feed.prototype._saveScrapped = function (item, data) {
  return (cb) => {
    toStream(data).pipe(this._createWriteStream({guid: `scrap/${item.guid}`, date: item.date})).on('finish', cb)
  }
}

Feed.prototype._createWriteStream = function (item) {
  return this._archive.createFileWriteStream({
    name: item.guid,
    ctime: item.date ? item.date.getTime() : 0
  })
}

Feed.prototype.load = function (entry, opts) {
  return new Promise((resolve, reject) => {
    this._load(entry, opts)((err, item) => {
      if (err) return reject(err)

      resolve(item)
    })
  })
}

Feed.prototype._load = function (entry, opts) {
  return (cb) => {
    toString(this._archive.createFileReadStream(entry)).then(str => {
      var item = (opts && opts.raw) ? str : JSON.parse(str)
      item.date = moment(item.date).toDate()

      cb(null, item)
    })
    .catch(err => {
      cb(err)
    })
  }
}

module.exports = Feed

function buildXML (archive, meta, entries) {
  return new Promise((resolve, reject) => {
    var feed = new FeedGen(Object.assign(meta, {feed_url: meta.xmlUrl, site_url: meta.link}))

    entries.forEach(e => {
      feed.addItem(e)
    })
    resolve(feed.render('rss-2.0'))
  })
}

function byCTimeDESC (x, y) {
  return y.ctime - x.ctime
}

