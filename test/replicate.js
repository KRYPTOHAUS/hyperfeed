const tape = require('tape')
const Hyperfeed = require('..')
const hyperdrive = require('hyperdrive')
const RSS = require('rss')
const memdb = require('memdb')

var feed = new RSS({
  title: 'test feed',
  feed_url: 'foo',
  site_url: 'bar'
})
var testEntries = []
for (var i = 0; i < 10; i++) {
  var x = {
    title: `entry${i}`,
    description: `desc${i}`,
    url: 'example.com',
    guid: i,
    date: Date.now()
  }
  testEntries.push(x)
  feed.item(x)
}

tape('replicate', function (t) {
  var torrent = new Hyperfeed()
  var write = torrent.swarm()
  torrent.update(feed.xml()).then(torrent => {
    var drive = hyperdrive(memdb())
    var peer = new Hyperfeed(drive, torrent.key(), {own: false})
    var read = peer.swarm()
    peer.list((err, entries) => {
      t.error(err)
      t.same(entries.length, 10)
      write.close()
      read.close()
      t.end()
    })
  })
})
