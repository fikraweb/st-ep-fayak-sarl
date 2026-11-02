// Isolated Brevo protocol stand-in: no real emails are ever sent by tests.
const {randomBytes}=require('node:crypto');const assert=require('node:assert/strict');
function createBrevoFixture(){
 const key=randomBytes(32).toString('hex'),messages=[],state={failStatus:0,throwAfterAccept:false,unconfirmed:false};
 return{bindings:{BREVO_API_KEY:key,BREVO_SENDER_EMAIL:'sender@example.test'},messages,state,fetch:async request=>{
  assert.equal(request.url,'https://api.brevo.com/v3/smtp/email');assert.equal(request.method,'POST');assert.equal(request.headers.get('api-key'),key);assert.match(request.headers.get('Content-Type'),/application\/json/);
  const message=await request.json();assert.deepEqual(message.to,[{email:'EP.FAYAK@GMAIL.COM',name:'Sté EP FAYAK SARL'}]);assert.equal(message.sender.email,'sender@example.test');assert.ok(message.replyTo.email);assert.match(message.headers.idempotencyKey,/^[a-f0-9-]{36}$/);assert.ok(message.textContent&&message.htmlContent);
  if(state.failStatus)return Response.json({code:state.failStatus===401?'unauthorized':'internal_error'},{status:state.failStatus});
  messages.push(message);
  if(state.throwAfterAccept)throw Error('Simulated lost acknowledgement');
  return Response.json(state.unconfirmed?{}:{messageId:'<test-'+messages.length+'@brevo.test>'},{status:201});
 }};
}
module.exports={createBrevoFixture};
