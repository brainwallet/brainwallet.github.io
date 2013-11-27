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
        var chainCode = lines[2].concat(lines[3]);
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

function armory_sign_message(private_key, address, message, compressed, addrtype)
{
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
  var a = str.split('\n');
  var pre = true;
  var fields = ["Address","Message","PublicKey","Signature"];
  var values = {};
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
          values[key]=''
          s = s.split(':')[1];
          break;
        }
      }

      if (key)
        values[key]+=armory_trim(s);
    }
  }
  return values;
}

function armory_verify_message(values)
{
  var adr = values['Address'];
  var msg = values['Message'];
  var pub = values['PublicKey'];
  var sig = values['Signature'];

  var digest = 'Bitcoin Signed Message:\n' +msg;
  var hash = Crypto.SHA256(Crypto.SHA256(digest, {asBytes: true}), {asBytes: true});

  var sig = [27].concat(Crypto.util.hexToBytes(sig));
  sig = Bitcoin.ECDSA.parseSigCompact(sig);

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

}

