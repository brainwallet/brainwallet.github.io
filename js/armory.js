  /*
    armory.js : Armory deterministic wallet implementation (public domain)
*/

function armory_extend_chain(pubKey, chainCode, privKey, fromPrivKey) {
    var chainXor = Crypto.SHA256(Crypto.SHA256(pubKey, {asBytes: true}), {asBytes: true});

    for (var i = 0; i < 32; i++)
        chainXor[i] ^= chainCode[i];

    var curve = getSECCurveByName("secp256k1");
    var secexp = null;
    var pt;

    var A;

    if (fromPrivKey) {
        A = BigInteger.fromByteArrayUnsigned(chainXor);
        var B = BigInteger.fromByteArrayUnsigned(privKey);
        var C = curve.getN();
        secexp = (A.multiply(B)).mod(C);
        pt = curve.getG().multiply(secexp);
    } else {
        A = BigInteger.fromByteArrayUnsigned(chainXor);
        pt = ECPointFp.decodeFrom(curve.getCurve(), pubKey).multiply(A);
    }

    var newPriv = secexp ? secexp.toByteArrayUnsigned() : [];
    var newPub = pt.getEncoded();
    var h160 = Bitcoin.Util.sha256ripe160(newPub);
    var addr = new Bitcoin.Address(h160);
    var sec = secexp ? new Bitcoin.Address(newPriv) : '';
    if (secexp)
        sec.version = 128;

    return [addr.toString(), sec.toString(), newPub, newPriv];
}

var armory_f = '0123456789abcdef';
var armory_t = 'asdfghjkwertuion';

function armory_map(str, from, to) {
    var res = '';
    for (var i = 0; i < str.length; i++)
        res += from.charAt(to.indexOf(str.charAt(i)));
    return res;
}

function armory_encode_keys(privKey, chainCode) {
    var key = privKey.concat(chainCode);
    var res = [];

    var str, code;

    for (var i = 0; i < 4; i++) {
        var bytes = key.slice(i * 16, i * 16 + 16);
        var cs = Crypto.SHA256(Crypto.SHA256(bytes, {asBytes: true}), {asBytes: true});
        str = Crypto.util.bytesToHex(bytes.concat(cs.slice(0,2)));
        code = armory_map(str, armory_t, armory_f);
        var arr = [];
        for (var j = 0; j < 9; j++)
            arr.push(code.substr(j*4, 4));
        code = arr.join(' ');
        res.push(code);
    }
    str = res.join('\n');
    return str;
}

function armory_derive_chaincode(root)
{
  var msg = 'Derive Chaincode from Root Key';
  var hash = Crypto.SHA256(Crypto.SHA256(root, {asBytes: true}), {asBytes: true});

  var okey = [];
  var ikey = [];
  for (var i in hash)
  {
    okey.push(0x5c^hash[i]);
    ikey.push(0x36^hash[i]);
  }

  var m = Crypto.charenc.UTF8.stringToBytes(msg);
  var a = Crypto.SHA256(ikey.concat(m), {asBytes: true});
  var b = Crypto.SHA256(okey.concat(a), {asBytes: true});
  return b;
}

function armory_decode_keys(data) {
    var keys = data.split('\n');
    var lines = [];
    for (var i = 0; i < keys.length; i++) {
        var k = keys[i].replace(' ','');
        var raw = Crypto.util.hexToBytes(armory_map(k, armory_f, armory_t));
        data = raw.slice(0, 16);
      lines.push(data);
    }
    try {
        var privKey = lines[0].concat(lines[1]);
        var chainCode = (lines.length==4) ? lines[2].concat(lines[3]) : armory_derive_chaincode(privKey);
        return [privKey, chainCode];
    } catch (errr) {
        return null;
    }
}

function armory_get_pubkey(privKey) {
    var curve = getSECCurveByName("secp256k1");
    var secexp = BigInteger.fromByteArrayUnsigned(privKey);
    var pt = curve.getG().multiply(secexp);
    return pt.getEncoded();
}

function armory_get_wallet_uid(pubKey) {
    var h160 = Bitcoin.Util.sha256ripe160(pubKey);
    var id = [0].concat(h160.slice(0,5)).reverse();
    return Bitcoin.Base58.encode(id);
}

var Armory = new function () {
    var pubKey;
    var privKey;
    var chainCode;
    var range;
    var counter;
    var timeout;
    var onSuccess;
    var onUpdate;

    function calcAddr() {
        var r = armory_extend_chain(pubKey, chainCode, privKey, true);
        onUpdate(r);
        pubKey = r[2];
        privKey = r[3];
        counter++;
        if (counter < range) {
            timeout = setTimeout(calcAddr, 0);
        } else {
            if (onSuccess)
                onSuccess();
        }
    }

    this.gen = function(seed, _range, update, success) {
        var keys = armory_decode_keys(seed);
        if (keys == null)
            return null;
        privKey = keys[0];
        chainCode = keys[1];
        pubKey = armory_get_pubkey(privKey);
        range = _range;
        counter = 0;
        onUpdate = update;
        onSuccess = success;
        clearTimeout(timeout);
        calcAddr();
        return armory_get_wallet_uid(pubKey);
    };

    this.stop = function () {
        clearTimeout(timeout);
    };

    return this;
};

function armory_trim(str)
{
  str = str.replace(/^\s+|\s+$/g, '');
  str = str.replace(/^"+|"+$/g, '');
  return str;
}

function armory_fmt(str, quote)
{
  var chunks = str.match(/.{1,50}/g);
  var span = '\n            ';
  span = quote ? '"'+span+'"':span;
  var res = chunks.join(span);
  return quote ? '"'+res+'"' : res;
}

function crc24(buf) {
  var table = [0x000000, 0x864cfb, 0x8ad50d, 0x0c99f6, 0x93e6e1, 0x15aa1a, 0x1933ec, 0x9f7f17, 0xa18139, 0x27cdc2, 0x2b5434, 0xad18cf, 0x3267d8, 0xb42b23, 0xb8b2d5, 0x3efe2e, 0xc54e89, 0x430272, 0x4f9b84, 0xc9d77f, 0x56a868, 0xd0e493, 0xdc7d65, 0x5a319e, 0x64cfb0, 0xe2834b, 0xee1abd, 0x685646, 0xf72951, 0x7165aa, 0x7dfc5c, 0xfbb0a7, 0x0cd1e9, 0x8a9d12, 0x8604e4, 0x00481f, 0x9f3708, 0x197bf3, 0x15e205, 0x93aefe, 0xad50d0, 0x2b1c2b, 0x2785dd, 0xa1c926, 0x3eb631, 0xb8faca, 0xb4633c, 0x322fc7, 0xc99f60, 0x4fd39b, 0x434a6d, 0xc50696, 0x5a7981, 0xdc357a, 0xd0ac8c, 0x56e077, 0x681e59, 0xee52a2, 0xe2cb54, 0x6487af, 0xfbf8b8, 0x7db443, 0x712db5, 0xf7614e, 0x19a3d2, 0x9fef29, 0x9376df, 0x153a24, 0x8a4533, 0x0c09c8, 0x00903e, 0x86dcc5, 0xb822eb, 0x3e6e10, 0x32f7e6, 0xb4bb1d, 0x2bc40a, 0xad88f1, 0xa11107, 0x275dfc, 0xdced5b, 0x5aa1a0, 0x563856, 0xd074ad, 0x4f0bba, 0xc94741, 0xc5deb7, 0x43924c, 0x7d6c62, 0xfb2099, 0xf7b96f, 0x71f594, 0xee8a83, 0x68c678, 0x645f8e, 0xe21375, 0x15723b, 0x933ec0, 0x9fa736, 0x19ebcd, 0x8694da, 0x00d821, 0x0c41d7, 0x8a0d2c, 0xb4f302, 0x32bff9, 0x3e260f, 0xb86af4, 0x2715e3, 0xa15918, 0xadc0ee, 0x2b8c15, 0xd03cb2, 0x567049, 0x5ae9bf, 0xdca544, 0x43da53, 0xc596a8, 0xc90f5e, 0x4f43a5, 0x71bd8b, 0xf7f170, 0xfb6886, 0x7d247d, 0xe25b6a, 0x641791, 0x688e67, 0xeec29c, 0x3347a4, 0xb50b5f, 0xb992a9, 0x3fde52, 0xa0a145, 0x26edbe, 0x2a7448, 0xac38b3, 0x92c69d, 0x148a66, 0x181390, 0x9e5f6b, 0x01207c, 0x876c87, 0x8bf571, 0x0db98a, 0xf6092d, 0x7045d6, 0x7cdc20, 0xfa90db, 0x65efcc, 0xe3a337, 0xef3ac1, 0x69763a, 0x578814, 0xd1c4ef, 0xdd5d19, 0x5b11e2, 0xc46ef5, 0x42220e, 0x4ebbf8, 0xc8f703, 0x3f964d, 0xb9dab6, 0xb54340, 0x330fbb, 0xac70ac, 0x2a3c57, 0x26a5a1, 0xa0e95a, 0x9e1774, 0x185b8f, 0x14c279, 0x928e82, 0x0df195, 0x8bbd6e, 0x872498, 0x016863, 0xfad8c4, 0x7c943f, 0x700dc9, 0xf64132, 0x693e25, 0xef72de, 0xe3eb28, 0x65a7d3, 0x5b59fd, 0xdd1506, 0xd18cf0, 0x57c00b, 0xc8bf1c, 0x4ef3e7, 0x426a11, 0xc426ea, 0x2ae476, 0xaca88d, 0xa0317b, 0x267d80, 0xb90297, 0x3f4e6c, 0x33d79a, 0xb59b61, 0x8b654f, 0x0d29b4, 0x01b042, 0x87fcb9, 0x1883ae, 0x9ecf55, 0x9256a3, 0x141a58, 0xefaaff, 0x69e604, 0x657ff2, 0xe33309, 0x7c4c1e, 0xfa00e5, 0xf69913, 0x70d5e8, 0x4e2bc6, 0xc8673d, 0xc4fecb, 0x42b230, 0xddcd27, 0x5b81dc, 0x57182a, 0xd154d1, 0x26359f, 0xa07964, 0xace092, 0x2aac69, 0xb5d37e, 0x339f85, 0x3f0673, 0xb94a88, 0x87b4a6, 0x01f85d, 0x0d61ab, 0x8b2d50, 0x145247, 0x921ebc, 0x9e874a, 0x18cbb1, 0xe37b16, 0x6537ed, 0x69ae1b, 0xefe2e0, 0x709df7, 0xf6d10c, 0xfa48fa, 0x7c0401, 0x42fa2f, 0xc4b6d4, 0xc82f22, 0x4e63d9, 0xd11cce, 0x575035, 0x5bc9c3, 0xdd8538];
  var crc = 0xb704ce;
  for (i=0; i<buf.length; i++)
    crc = (table[((crc >> 16) ^ buf[i]) & 0xff] ^ (crc << 8)) & 0xffffff;
  return crc;
}

function armory_split_string(str) {
  var l = str.length, lc = 0, chunks = [], c = 0, chunkSize = 64;
  for (; lc < l; c++)
    chunks[c] = str.slice(lc, lc += chunkSize);
  return chunks.join('\r\n');
}

function armory_sign_message(private_key, address, message, compressed, addrtype, mode)
{
  // armory needs \r\n for some reason
  message = message.replace(/\n/g,'\r\n');

  var sig = sign_message(private_key, message, compressed, addrtype);
  var sig_bytes = Crypto.util.base64ToBytes(sig);
  var msg_bytes = Crypto.charenc.UTF8.stringToBytes(message);

  if (mode=='armory_base64') {

    var payload = sig_bytes.concat(msg_bytes);
    var crc = crc24(payload);

    return '-----BEGIN BITCOIN MESSAGE-----'
      +'\nComment: Signed by Bitcoin Armory v0.93.1'
      +'\n'
      +'\n'+armory_split_string(Crypto.util.bytesToBase64(payload))
      +'\n='+Crypto.util.bytesToBase64([crc & 0xff, (crc >>> 8 ) & 0xff, (crc >>> 16 ) & 0xff])
      +'\n'+'-----END BITCOIN MESSAGE-----';

  } else if (mode=='armory_clearsign') {

    var payload = sig_bytes;
    var crc = crc24(payload);

    return '-----BEGIN BITCOIN SIGNED MESSAGE-----'
      +'\nComment: Signed by Bitcoin Armory v0.93.1'
      +'\n'
      +'\n'+message
      +'\n-----BEGIN BITCOIN SIGNATURE-----'
      +'\n'
      +'\n'
      +'\n'+armory_split_string(Crypto.util.bytesToBase64(payload))
      +'\n='+Crypto.util.bytesToBase64([crc & 0xff, (crc >>> 8 ) & 0xff, (crc >>> 16 ) & 0xff])
      +'\n'+'-----END BITCOIN SIGNATURE-----';
  }

  message = message.replace(/\r|\n/g, ' ');
  message = message.replace(/\"/g, '\'');

  var digest = 'Bitcoin Signed Message:\n' +message;
  var hash = Crypto.SHA256(Crypto.SHA256(digest, {asBytes: true}), {asBytes: true});
  var sig = private_key.sign(hash);
  var obj = Bitcoin.ECDSA.parseSig(sig);
  var sigHex = Crypto.util.bytesToHex(integerToBytes(obj.r, 32))+Crypto.util.bytesToHex(integerToBytes(obj.s, 32));
  var pubHex = Crypto.util.bytesToHex(private_key.pub);

  return '-----BEGIN-SIGNATURE-BLOCK-------------------------------------'
      +'\nAddress:    '+address
      +'\nMessage:    '+armory_fmt(message,true)
      +'\nPublicKey:  '+armory_fmt(pubHex)
      +'\nSignature:  '+armory_fmt(sigHex)
      +'\n-----END-SIGNATURE-BLOCK---------------------------------------';
}

function armory_split_message(str)
{
  var regs = str.match(/-----BEGIN BITCOIN MESSAGE-----\nComment.*\n+([\s\S]*?)\n-----END BITCOIN MESSAGE-----/m);
  if (regs && regs.length==2) {

    var s = regs[1].split('\n');
    s = s.slice(0,-1); // ignore crc for now
    var payload = s.join('');

    var bytes = Crypto.util.base64ToBytes(payload);

    var sig_bytes = bytes.slice(0,65);
    var msg_bytes = bytes.slice(65);

    var msg =''; try { msg = Crypto.charenc.UTF8.bytesToString(msg_bytes); } catch (err) {  console.log(err); return null; };
    var sig = Crypto.util.bytesToBase64(sig_bytes);

    return { "message": msg, "signature": sig, "type": "armory_base64" };
  }

  regs = str.match(/-----BEGIN BITCOIN SIGNED MESSAGE-----\nComment.*\n+([\s\S]*?)\n-----BEGIN BITCOIN SIGNATURE-----\n+([\s\S]*?)\n-----END BITCOIN SIGNATURE-----/m);
  if (regs && regs.length==3) {
    var msg = regs[1];
    var s = regs[2].split('\n');
    s = s.slice(0,-1); // ignore crc for now
    var sig = s.join(''); 

    // again, armory needs \r\n in message for some reason
    msg = msg.replace(/\n/g,'\r\n');

    return { "message": msg, "signature": sig, "type": "armory_clearsign" };
  }

  var a = str.split('\n');
  var pre = true;
  var fields = ["Address","Message","PublicKey","Signature"];
  var p = {};
  var key = null;
  for (i in a)
  {
    var s = a[i];

    if (pre && s.indexOf('-----BEGIN-SIGNATURE-BLOCK')==0)
      pre = false;

    if (!pre)
    {
      if (s.indexOf('-----END-SIGNATURE-BLOCK')==0)
        break;
      for (j in fields)
      {
        var k = fields[j];
        if (s.indexOf(k+':')==0)
        {
          key = k;
          p[key]=''
          s = s.split(':')[1];
          break;
        }
      }

      if (key)
        p[key]+=armory_trim(s);
    }
  }

  if (p.Message && p.Signature && p.Address && p.PublicKey)
  {
    // return signature in a standard base64 form
    var bytes = [27].concat(Crypto.util.hexToBytes(p.Signature));
    sig = Crypto.util.bytesToBase64(bytes);
    return {"message":p.Message, "address":p.Address, "signature":sig, "pubkey":p.PublicKey, "type": "armory_hex" };
  }

  return null;
}

function armory_verify_message(p)
{
  var adr = p['address'];
  var msg = p['message'];
  var pub = p['pubkey'];
  var sig = p['signature'];

  if (!adr || !msg || !pub || !sig )
    return false;

  var digest = 'Bitcoin Signed Message:\n' +msg;
  var hash = Crypto.SHA256(Crypto.SHA256(digest, {asBytes: true}), {asBytes: true});

  var bytes = Crypto.util.base64ToBytes(sig);
  sig = Bitcoin.ECDSA.parseSigCompact(bytes);

  var res = false;

  for (var i=0; i<4; i++)
  {
    sig.i = i;

    try {
      var pubKey = Bitcoin.ECDSA.recoverPubKey(sig.r, sig.s, hash, sig.i);
    } catch(err) {
      return false;
    }

    var expectedAddress = pubKey.getBitcoinAddress().toString();
    if (expectedAddress==adr)
    {
      res = adr;
      break;
    }
  }

  return res;
}

// command-line tests
if (typeof require != 'undefined' && require.main === module) {
  window=global,navigator=Bitcoin={};eval(require('fs').readFileSync('./bitcoinjs-min.js')+'');

  var s = [
    '-----BEGIN-SIGNATURE-BLOCK-------------------------------------',
    'Address:    1JwSSubhmg6iPtRjtyqhUYYH7bZg3Lfy1T',
    'Message:    "This is an example of a signed message."',
    'PublicKey:  0478d430274f8c5ec1321338151e9f27f4c676a008bdf8638d',
    '            07c0b6be9ab35c71a1518063243acd4dfe96b66e3f2ec8013c',
    '            8e072cd09b3834a19f81f659cc3455',
    'Signature:  ad2e12415efc3509c261daee79eb31ae5a1dffd89045222d15',
    '            b73740866649b119d2415d02917164e80d5c20a7820c768d15',
    '            2be377ea19a7f4f645227d9d2902',
    '-----END-SIGNATURE-BLOCK---------------------------------------'
  ].join('\n');

  console.log('verified to: ' + armory_verify_message(armory_split_message(s)));

  var codes = [
    'atuw tnde sghh utho sudi ekgk ohoj odwd ojhw',
    'ueis hnrt fsht fjes gsgg gswg eutd duus ftfs',
    'jgjs fghg waug hjah faaw tksn gwig hrrr tdot',
    'kjuu oeuj kdun adst gfug howu jjes fndd fref'
  ].join('\n');

  Armory.gen(codes, 5, function(r) { console.log(r[0]); } );

  var codes = [
    'fdrn oeej stgu orhe tujr ndhj fedh ijnh duuo',
    'tdrd irhg jsgi djrg iasu ifof oass nust hhgg'
  ].join('\n');

  Armory.gen(codes, 5, function(r) { console.log(r[0]); } );
}

