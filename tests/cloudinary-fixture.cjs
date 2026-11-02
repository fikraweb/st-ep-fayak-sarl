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
    assert.match(url.pathname,/^\/v1_1\/test-cloud\/image\/(upload|download|destroy)$/);
    const action=url.pathname.split('/').pop();
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
      files.set(params.public_id,{bytes,type:file.type,format:params.format});
      return Response.json({public_id:params.public_id,type:'authenticated',resource_type:'image',format:params.format,bytes:bytes.byteLength,version:1,secure_url:'https://res.cloudinary.com/not-used'});
    }
    if(action==='destroy') {
      assert.equal(params.invalidate,'true');
      if(state.destroyFailure)return Response.json({error:{message:'destroy failed'}},{status:503});
      return Response.json({result:files.delete(params.public_id)?'ok':'not found'});
    }
    state.downloads++;
    assert.equal(params.attachment,'false');
    assert.ok(Number(params.expires_at)>Date.now()/1000&&Number(params.expires_at)<=Date.now()/1000+61);
    if(state.downloadFailure)return new Response(null,{status:503});
    const found=files.get(params.public_id);
    if(!found)return new Response(null,{status:404});
    assert.equal(params.format,found.format);
    return new Response(found.bytes,{headers:{'Content-Type':found.type}});
  }catch(error){state.lastFailure=error.message;throw error}};
  return {bindings,fetch,files,state};
}
module.exports={createCloudinaryFixture};
