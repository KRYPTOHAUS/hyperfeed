const tape = require('tape')
const fs = require('fs')
const hyperdrive = require('hyperdrive')
const hyperfeed = require('..')
const Feed = require('feed')
const FeedParser = require('feedparser')
const toStream = require('string-to-stream')
const raf = require('random-access-file')
const memdb = require('memdb')

// =============
// test data
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
var drive = hyperdrive(memdb())
var setupTestFeed = function () {
  return new Promise((resolve, reject) => {
    hyperfeed(drive).createFeed().update(rss).then(resolve)
  })
}

// =====
// tests

tape('update & list', function (t) {
  setupTestFeed().then(f => {
    f.list((err, entries) => {
      t.error(err)
      t.same(entries.length, 10)
      t.end()
    })
  })
})

tape('multiple update', function (t) {
  var feed2 = new Feed({
    title: 'test feed',
    description: 'http://example.com',
    link: 'http://example.com'
  })
  for (var i = 0; i < 10; i++) {
    var x = {
      title: `entry${i}`,
      description: `desc${i}`,
      url: 'example.com',
      guid: `id-${i}`,
      date: new Date()
    }
    feed2.addItem(x)
  }
  setupTestFeed().then(f => {
    // update with same xml
    f.update(feed2.render('rss-2.0')).then(f => {
      f.list((err, entries) => {
        t.error(err)
        t.same(entries.length, 10)

        // update with xml + 1 new item
        var x = {
          title: `entry${10}`,
          description: `desc${10}`,
          url: 'example.com',
          guid: `id-${10}`,
          date: new Date()
        }
        feed2.addItem(x)
        f.update(feed2.render('rss-2.0')).then(f => {
          f.list((err, entries) => {
            t.error(err)
            t.same(entries.length, 11)
            t.end()
          })
        })
      })
    })
  })
})

tape('push', function (t) {
  var feed = new Feed({
    title: 'test feed',
    description: 'http://example.com',
    link: 'http://example.com'
  })
  var rss = feed.render('rss-2.0')
  var f = hyperfeed().createFeed()
  f.update(rss).then(f => {
    f.push({title: 'moo'}).then(f => {
      f.list((err, entries) => {
        t.error(err)
        f.load(entries[0]).then(item => {
          t.error(err)

          t.ok(item.guid) // should have default name(guid)
          t.ok(item.date) // should have default value
          t.end()
        })
      })
    })
  })
})

tape('live list', function (t) {
  setupTestFeed().then(f => {
    var list = f.list({live: true})
    t.ok(list)
    var count = 0
    list.on('data', entry => {
      count += 1
      if (count === 11) t.end() // should include newly pushed items
    })
    f.push({title: 'moo'})
  })
})

tape('nested live and non-live list', function (t) {
  setupTestFeed().then(f => {
    var list = f.list({live: true})
    t.ok(list)
    var count = 0
    list.on('data', entry => {
      count += 1
      if (count === 11) { // should include newly pushed items
        var list2 = f.list()
        var count2 = 0
        list2.on('data', entry => {
          count2 += 1
        })
        list2.on('end', entry => {
          t.same(count2, 11)
          t.end()
        })
      }
    })
    f.push({title: 'moo'})
  })
})

tape('non-live list', function (t) {
  setupTestFeed().then(f => {
    var list = f.list()
    t.ok(list)
    var count = 0
    list.on('data', entry => {
      count += 1
    })
    list.on('end', () => {
      t.same(count, 10)
      t.end()
    })
  })
})

tape('load', function (t) {
  setupTestFeed().then(f => {
    f.list((err, entries) => {
      t.error(err)
      t.same(entries.length, 10)
      var count = 0
      entries.forEach(e => {
        f.load(e).then(item => {
          t.error(err)
          t.same(item.guid, e.name)
          count += 1
          if (count === 10) t.end()
        })
      })
    })
  })
})

tape('create xml', function (t) {
  setupTestFeed().then(f => {
    f.xml(10).then(xml => {
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
  var f = hyperfeed(drive).createFeed()

  f.update(rss).then(f => {
    f.list((err, entries) => {
      t.error(err)
      t.same(entries.length, 1)
      t.end()
    })
  })
})

tape('set meta', function (t) {
  setupTestFeed().then(f => {
    f.setMeta({
      title: 'foo',
      description: 'http://example2.com',
      link: 'http://example2.com'
    }).then(f => {
      f.xml(10).then(xml => {
        var parser = new FeedParser()
        toStream(xml).pipe(parser)

        parser.on('error', e => t.error(e))
        parser.on('meta', meta => {
          t.same(meta.title, 'foo')
          t.same(meta.link, 'http://example2.com')
          t.same(meta.description, 'http://example2.com')
        })
        parser.on('data', entry => {
          // ignore entry, we still need this handler to consume the feed and trigger end event
        })
        parser.on('end', () => {
          t.end()
        })
      })
    })
  })
})

tape('raf', function (t) {
  var f = hyperfeed(drive).createFeed({file: function (name) { return raf('test/' + name) }})
  f.update(rss).then(f => {
    fs.stat('test/id-0', (err, stats) => {
      t.error(err)
      t.ok(stats)

      // clean up test files
      for (var i = 0; i < 10; i++) {
        fs.unlinkSync(`test/id-${i}`)
      }
      fs.unlinkSync('test/_meta')
      t.end()
    })
  })
})

