import assert from 'node:assert/strict';
import worker from '../worker/index.js';

class Bucket {
  map = new Map();

  async get(key) {
    const object = this.map.get(key);
    return object ? {...object, json: async () => JSON.parse(object.body)} : null;
  }

  async put(key, body, options = {}) {
    const old = this.map.get(key);
    if (options.onlyIf?.etagDoesNotMatch === '*' && old) return null;
    if (options.onlyIf?.etagMatches && old?.etag !== options.onlyIf.etagMatches) return null;
    const object = {
      body,
      size: typeof body === 'string' ? Buffer.byteLength(body) : body.byteLength,
      etag: crypto.randomUUID(),
      ...options,
    };
    this.map.set(key, object);
    return object;
  }

  async list({prefix}) {
    const objects = [...this.map.keys()].filter(key => key.startsWith(prefix)).map(key => ({key}));
    return {objects, truncated: false};
  }
}

const env = {BUCKET: new Bucket()};
const origin = 'https://test.example';

function request(path, body, auth = true) {
  return worker.fetch(new Request(origin + '/api/' + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      ...(auth ? {'oai-authenticated-user-id': 'owner'} : {}),
      Origin: origin,
      'Content-Type': 'application/json',
    },
    ...(body ? {body: JSON.stringify(body)} : {}),
  }), env);
}

async function call(path, body, auth) {
  const response = await request(path, body, auth);
  return {status: response.status, data: await response.json()};
}

async function assertImage(file, type, bytes) {
  assert.equal(file.type, type);
  assert.match(file.name, type === 'image/png' ? /[.]png$/ : /[.]jpg$/);
  assert.deepEqual(Buffer.from(await file.arrayBuffer()), bytes);
}

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR42mNIuqMMAAMFAWIy/iCBAAAAAElFTkSuQmCC', 'base64');
const jpeg = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAABgf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCiAT8Wf//Z', 'base64');
const meme = {title: 'Test meme', url: 'https://www.reddit.com/r/test/1', image: 'https://i.redd.it/example.jpg', score: 100};
const pngMeme = {...meme, title: 'Test PNG', image: 'https://i.redd.it/example.png'};

assert.equal((await call('state', null, false)).status, 401);
assert.equal((await call('import', meme)).data.added, true);
assert.equal((await call('import', meme)).data.added, false);
const initial = (await call('state')).data;
assert.equal(initial.items.length, 1);
const id = initial.items[0].id;
assert.equal((await call('publish', {id, channel: 'x'})).status, 400);
env.X_ACCESS_TOKEN = 'test-x-token';
assert.equal((await call('publish', {id, channel: 'x'})).status, 400);
await call('update', {id, rights: true, status: 'approved', caption: 'caption'});

env.FACEBOOK_PAGE_TOKEN = 'test-page-token';
env.FACEBOOK_PAGE_ID = '123';
env.REDDIT_ACCESS_TOKEN = 'test-reddit-token';
const redditUpload = 'https://reddit-uploaded-media.s3-accelerate.amazonaws.com/';
const counts = {jpgFetches: 0, xUploads: 0, xPosts: 0, fbPosts: 0, redditPosts: 0};
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, options) => {
  const url = String(input);
  if (url === meme.image) {
    counts.jpgFetches++;
    return new Response(jpeg, {headers: {'Content-Type': 'image/jpeg'}});
  }
  if (url === pngMeme.image) {
    return new Response(png, {headers: {'Content-Type': 'image/png'}});
  }
  if (url === 'https://api.x.com/2/media/upload') {
    counts.xUploads++;
    assert.equal(options.headers.Authorization, 'Bearer test-x-token');
    assert.equal(options.body.get('media_category'), 'tweet_image');
    await assertImage(options.body.get('media'), 'image/jpeg', jpeg);
    return counts.xUploads === 1
      ? Response.json({title: 'Forbidden'}, {status: 403})
      : Response.json({data: {id: 'uploaded-x-image'}});
  }
  if (url === 'https://api.x.com/2/tweets') {
    counts.xPosts++;
    assert.deepEqual(JSON.parse(options.body), {text: 'caption', media: {media_ids: ['uploaded-x-image']}});
    return Response.json({data: {id: 'posted-to-x'}});
  }
  if (url === 'https://graph.facebook.com/v26.0/123/photos') {
    counts.fbPosts++;
    assert.equal(options.body.get('caption'), 'caption');
    assert.equal(options.body.get('published'), 'true');
    assert.equal(options.body.has('url'), false);
    await assertImage(options.body.get('source'), 'image/jpeg', jpeg);
    return Response.json({id: 'fb-photo', post_id: 'fb-post'});
  }
  if (url === 'https://oauth.reddit.com/api/media/asset.json') {
    assert.equal(options.headers.Authorization, 'Bearer test-reddit-token');
    assert.equal(options.body.get('mimetype'), 'image/png');
    assert.match(options.body.get('filepath'), /[.]png$/);
    return Response.json({args: {
      action: '//reddit-uploaded-media.s3-accelerate.amazonaws.com',
      fields: [{name: 'key', value: 'images/test.png'}, {name: 'policy', value: 'test-policy'}],
    }});
  }
  if (url === redditUpload) {
    assert.equal(options.headers, undefined);
    assert.equal(options.body.get('key'), 'images/test.png');
    assert.equal(options.body.get('policy'), 'test-policy');
    assert.equal([...options.body.keys()].at(-1), 'file');
    await assertImage(options.body.get('file'), 'image/png', png);
    return new Response('<PostResponse/>', {status: 201});
  }
  if (url === 'https://oauth.reddit.com/api/submit') {
    counts.redditPosts++;
    assert.equal(options.body.get('kind'), 'image');
    assert.equal(options.body.get('sr'), 'test');
    assert.equal(options.body.get('title'), pngMeme.title);
    assert.equal(options.body.get('url'), redditUpload + 'images/test.png');
    return Response.json({json: {errors: [], data: {websocket_url: 'wss://test.example/result'}}});
  }
  assert.fail('Unexpected upstream request to ' + url);
};

try {
  const download = await request('download/' + id);
  assert.equal(download.headers.get('Content-Type'), 'image/jpeg');
  assert.match(download.headers.get('Content-Disposition'), /^attachment; filename="meme-[a-f0-9]{8}[.]jpg"$/);
  assert.deepEqual(Buffer.from(await download.arrayBuffer()), jpeg);
  assert.equal(counts.jpgFetches, 1);

  const x = {id, channel: 'x'};
  const first = await call('publish', x);
  assert.equal(first.data.deliveries.x.status, 'upload failed');
  assert.equal(counts.xPosts, 0);
  const retries = await Promise.all([call('publish', x), call('publish', x)]);
  assert.deepEqual(retries.map(result => result.status).sort(), [200, 400]);
  const posted = retries.find(result => result.status === 200);
  assert.equal(posted.data.deliveries.x.status, 'published');
  assert.equal(posted.data.deliveries.x.id, 'posted-to-x');
  assert.equal((await call('publish', x)).status, 400);
  assert.equal(counts.xUploads, 2);
  assert.equal(counts.xPosts, 1);

  const facebook = await call('publish', {id, channel: 'facebook'});
  assert.equal(facebook.data.deliveries.facebook.status, 'published');
  assert.equal(facebook.data.deliveries.facebook.id, 'fb-post');
  assert.equal(counts.fbPosts, 1);
  assert.equal(counts.jpgFetches, 1, 'Publishing reuses the downloaded JPG bytes');

  await call('import', pngMeme);
  const pngId = (await call('state')).data.items.find(item => item.image === pngMeme.image).id;
  await call('update', {id: pngId, rights: true, status: 'approved'});
  const reddit = {id: pngId, channel: 'reddit', subreddit: 'test'};
  const pending = await call('publish', reddit);
  assert.equal(pending.data.deliveries.reddit.status, 'awaiting confirmation');
  assert.equal((await call('publish', reddit)).status, 400);
  assert.equal(counts.redditPosts, 1);
  const pngDownload = await request('download/' + pngId);
  assert.equal(pngDownload.headers.get('Content-Type'), 'image/png');
  assert.match(pngDownload.headers.get('Content-Disposition'), /[.]png"$/);
  assert.deepEqual(Buffer.from(await pngDownload.arrayBuffer()), png);
} finally {
  globalThis.fetch = realFetch;
}

assert.equal((await call('download', null)).status, 400);
assert.equal((await call('download/missing', null)).status, 400);
assert.equal((await call('import', {...meme, image: 'javascript:alert(1)'})).status, 400);
const crossOrigin = await worker.fetch(new Request(origin + '/api/import', {
  method: 'POST',
  headers: {Origin: 'https://evil.example', 'oai-authenticated-user-id': 'owner'},
  body: JSON.stringify(meme),
}), env);
assert.equal(crossOrigin.status, 403);
const html = await (await worker.fetch(new Request(origin), env)).text();
const client = html.split('<script>')[1].split('</script>')[0];
new Function(client);

console.log('Passed authentication, origin checks, deduplication, approvals, JPG and PNG downloads, native uploads on all three channels, retry and duplicate protection, and client syntax.');
