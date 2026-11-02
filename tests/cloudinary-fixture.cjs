// Protocol-only Cloudinary stand-in. No real account or network calls in tests.
const assert = require('node:assert/strict');
const { createHash,randomBytes } = require('node:crypto');
function createCloudinaryFixture() {
  const secret=randomBytes(32).toString('hex'),key=randomBytes(12).toString('hex');
  const files=new Map();
  const state={destroyFailure:false,downloadFailure:false,uploadFailure:false,downloads:0,requests:0,lastFailure:null};
  const bindings={CLOUDINARY_CLOUD_NAME:'test-cloud',CLOUDINARY_API_KEY:key,CLOUDINARY_API_SECRET:secret};
  const fetch=async request=>{state.requests++;try{
    const url=new URL(request.url);
    assert.equal(url.origin,'https://api.cloudinary.com');
    assert.match(url.pathname,/^\/v1_1\/test-cloud\/(image|video)\/(upload|download|destroy)$/);
    const action=url.pathname.split('/').pop(),resourceType=url.pathname.split('/')[3];
    const params=action==='download'?Object.fromEntries(url.searchParams):Object.fromEntries(await request.formData());
    assert.equal(params.api_key,key);
    const {api_key,signature,file,...signed}=params;
    const canonical=Object.keys(signed).sort().map(k=>`${k}=${String(signed[k]).replace(/&/g,'%26')}`).join('&');
    assert.equal(signature,createHash('sha1').update(canonical+secret).digest('hex'),'Cloudinary signature must cover the exact parameters');
    assert.equal(params.type,'authenticated','No unsigned/public uploads or downloads');
    assert.match(params.public_id,/^ep-fayak\/[a-z]+\/[a-f0-9-]{36}$/);
    assert.ok(Math.abs(Date.now()/1000-Number(params.timestamp))<60);
    if(action==='upload') {
      if(state.uploadFailure)return Response.json({error:{message:'upstream failure'}},{status:503});
      assert.equal(params.overwrite,'false');
      assert.ok(file&&file.size>0);
      const bytes=new Uint8Array(await file.arrayBuffer());
      files.set(params.public_id,{bytes,type:file.type,format:params.format,resourceType});
      return Response.json({public_id:params.public_id,type:'authenticated',resource_type:resourceType,format:params.format,bytes:bytes.byteLength,version:1,secure_url:'https://res.cloudinary.com/not-used'});
    }
    if(action==='destroy') {
      assert.equal(params.invalidate,'true');
      if(state.destroyFailure)return Response.json({error:{message:'destroy failed'}},{status:503});
      if(files.has(params.public_id))assert.equal(files.get(params.public_id).resourceType,resourceType);
      return Response.json({result:files.delete(params.public_id)?'ok':'not found'});
    }
    state.downloads++;
    assert.equal(params.attachment,'false');
    assert.ok(Number(params.expires_at)>Date.now()/1000&&Number(params.expires_at)<=Date.now()/1000+61);
    if(state.downloadFailure)return new Response(null,{status:503});
    const found=files.get(params.public_id);
    if(!found)return new Response(null,{status:404});
    assert.equal(params.format,found.format);assert.equal(resourceType,found.resourceType);
    const range=request.headers.get('Range');
    if(range){const match=range.match(/^bytes=(\d*)-(\d*)$/);assert.ok(match);const length=found.bytes.length,start=match[1]?Number(match[1]):Math.max(0,length-Number(match[2])),end=match[1]?(match[2]?Math.min(length-1,Number(match[2])):length-1):length-1;if(start>=length||start>end)return new Response(null,{status:416,headers:{'Content-Range':`bytes */${length}`}});return new Response(found.bytes.slice(start,end+1),{status:206,headers:{'Content-Type':found.type,'Content-Range':`bytes ${start}-${end}/${length}`,'Content-Length':String(end-start+1)}})}
    return new Response(found.bytes,{headers:{'Content-Type':found.type,'Content-Length':String(found.bytes.length)}});
  }catch(error){state.lastFailure=error.message;throw error}};
  return {bindings,fetch,files,state};
}
module.exports={createCloudinaryFixture};
