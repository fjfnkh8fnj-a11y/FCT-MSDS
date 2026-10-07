// Compatibility for Safari versions predating PDF.js runtime APIs.
if(!Promise.withResolvers)Promise.withResolvers=function(){let resolve,reject;const promise=new this((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
if(!Promise.try)Promise.try=function(callback,...args){return new this(resolve=>resolve(callback(...args)));};
if(!Uint8Array.fromBase64)Uint8Array.fromBase64=function(value,options={}){const input=options.alphabet==='base64url'?value.replace(/-/g,'+').replace(/_/g,'/'):value;return Uint8Array.from(atob(input),c=>c.charCodeAt(0));};
if(!Uint8Array.prototype.toBase64)Uint8Array.prototype.toBase64=function(options={}){let value='';for(let i=0;i<this.length;i+=8192)value+=String.fromCharCode(...this.subarray(i,i+8192));let encoded=btoa(value);if(options.alphabet==='base64url')encoded=encoded.replace(/\+/g,'-').replace(/\//g,'_');return options.omitPadding?encoded.replace(/=+$/,''):encoded;};
if(!Uint8Array.prototype.toHex)Uint8Array.prototype.toHex=function(){return Array.from(this,v=>v.toString(16).padStart(2,'0')).join('');};
