const tape = require('tape')
const Hyperfeed = require('..')
const Feed = require('feed')
const FeedParser = require('feedparser')
const toStream = require('string-to-stream')

var feed = new Feed({
  title: 'test feed',
  description: 'http://example.com',
  link: 'http://example.com'
})
var testEntries = []
for (var i = 0; i < 10; i++) {
  var x = {
    title: `entry${i}`,
    description: `desc${i}`,
    url: 'example.com',
    guid: `id-${i}`,
    date: new Date()
  }
  testEntries.push(x)
  feed.addItem(x)
}
var rss = feed.render('rss-2.0')

tape('create archive from rss', function (t) {
  var torrent = new Hyperfeed()
  torrent.update(rss).then(torrent => {
    torrent.list((err, entries) => {
      t.error(err)
      t.same(entries.length, 10)
      t.end()
    })
  })
})

tape('push', function (t) {
  var torrent = new Hyperfeed()
  torrent.update(rss).then(torrent => {
    torrent.push({title: 'moo', guid: 'x'}).then(torrent => {
      torrent.list((err, entries) => {
        t.error(err)
        t.same(entries.length, 11)
        t.end()
      })
    })
  })
})

tape('create xml', function (t) {
  var torrent = new Hyperfeed()
  torrent.update(rss).then(torrent => {
    torrent.xml(10).then(xml => {
      var parser = new FeedParser()
      toStream(xml).pipe(parser)

      var entries = []
      parser.on('error', e => t.error(e))
      parser.on('meta', meta => {
        t.same(meta.title, 'test feed')
        t.same(meta.link, 'http://example.com')
      })
      parser.on('data', entry => {
        entries.push(entry)
      })
      parser.on('end', () => {
        t.same(entries.map(x => x.title).sort(), testEntries.map(x => x.title))
        t.end()
      })
    })
  })
})

tape('dedup', function (t) {
  var feed = new Feed({
    title: 'test feed',
    description: 'http://example.com',
    link: 'http://example.com'
  })
  var testEntries = []
  for (var i = 0; i < 3; i++) {
    var x = {
      title: `entry${i}`,
      description: `desc${i}`,
      url: 'example.com',
      guid: 1, // all with same guid
      date: new Date()
    }
    testEntries.push(x)
    feed.addItem(x)
  }
  var rss = feed.render('rss-2.0')

  var torrent = new Hyperfeed()
  torrent.update(rss).then(torrent => {
    torrent.list((err, entries) => {
      t.error(err)
      t.same(entries.length, 1)
      t.end()
    })
  })
})
