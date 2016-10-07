# Hyperfeed

[![NPM Version](https://img.shields.io/npm/v/hyperfeed.svg)](https://www.npmjs.com/package/hyperfeed) [![JavaScript Style Guide](https://img.shields.io/badge/code%20style-standard-brightgreen.svg)](http://standardjs.com/)

Hyperfed is a self-archiving P2P live feed. You can convert any RSS/ATOM/RDF Feed to a P2P live update publishing network.

* **Self-archiving**: All published items will be archived. If the feed is updated and doesn't contain old items, Hyperfeed still preserve them.
* **P2P**: Feed items are distributed in a P2P manner. Save bandwidth and support offline mode.
* **Live**: No need to constantly scrap a RSS feed, Updates will be pushed to you.

```
npm install hyperfeed
```

## Synopsis

host a feed:

```js
const request = require('request')
const hyperfeed = require('hyperfeed')

request('https://medium.com/feed/google-developers', (err, resp, body) => {
  hyperfeed().createFeed.update(body).then(feed => {
    feed.swarm() // share it through a p2p network
    console.log(feed.key().toString('hex')) // this will be the key for discovering
  })
})
```

download feed from peer

```js
const Hyperfeed = require('hyperfeed')

var feed = hyperfeed().createFeed(<KEY FROM ABOVE>, {own: false})
feed.swarm() // load the feed from the p2p network
feed.list((err, entries) => {
  console.log(entries) // all entries in the feed (include history entries)
})
```

## API

#### `var hf = hyperfeed([drive])`

Create a new Hyperfeed instance. If you want to reuse an existing hyperdrive, pass it as argument.

#### `var feed = hf.createFeed([key], [opts])`

Create a new Hyperfeed instance. If you want to download from an existing feed, pass the feed's key as the first argument. Options include

```js
{
  own: boolean, // REQUIRED if `key` is not null. Set to true if this is a hyperfeed you created (in the same storage) before.
  file: function (name) { return raf(name) }, // set to a raf if you want to save items to filesystem
  scrap: false      // if set to true, hyperfeed will also save the page each feed item pointed to.
}
```

where raf is

```js
const raf = require('random-access-file')
```

#### `feed.swarm([opts])`

Start replicating the feed with a swarm p2p network. Peers can download this feed with its key.

Check [https://github.com/karissa/hyperdrive-archive-swarm](https://github.com/karissa/hyperdrive-archive-swarm) for options.

#### `feed.key()`

Returns the 32-bit public key of the feed.

#### `var promise = feed.update(rssXML)`

Parse and save new items from a Feed XML. We support RSS, ATOM, and RDF feeds.

#### `feed.meta`

Returns the metadata of the feed.

#### `var promise = feed.setMeta(obj)`

Explicitly set the metadata

#### `var promise = feed.push(item)`

Push a new feed item into hyperfeed. Check [https://github.com/jpmonette/feed](https://github.com/jpmonette/feed) for item detail.

#### `var stream = feed.list([opts], [cb])`

Returns a readable stream of all entries in the archive, include history

```js
{
  offset: 0 // start streaming from this offset (default: 0)
  live: false // keep the stream open as new updates arrive (default: false)
}
```

You can collect the results of the stream with cb(err, entries).

**Entries are metadata of feed items. If you want to get the feed item itself, call `feed.load(entry)`**

#### `var promise = feed.load(entry, [opts])`

Returns a Feed item from given entry.

if you want to load scrapped data and it's not a JSON. set `opts` to `{raw: true}`

`entry` is an object returned by `#list()`

#### `var promise = feed.xml(count)`

Returns a RSS-2.0 Feed in XML format containing latest `count` items.

## License

The MIT License
