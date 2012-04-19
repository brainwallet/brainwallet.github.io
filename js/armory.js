/*
    armory.js : Armory-like deterministic key generator (public domain).
*/

function armory_extend_chain(pubKey, chainCode, privKey, fromPrivKey) {
    var chainMod = Crypto.SHA256(Crypto.SHA256(pubKey, {asBytes: true}), {asBytes: true})
    var chainXor = chainMod.slice(0);
    for (var i = 0; i < 32; i++)
        chainXor[i] ^= chainCode[i];

    var curve = getSECCurveByName("secp256k1");
    var secexp, pt;

    if (fromPrivKey) {
        var A = BigInteger.fromByteArrayUnsigned(chainXor);
        var B = BigInteger.fromByteArrayUnsigned(privKey);
        var C = curve.getN();
        secexp = (A.multiply(B)).mod(C);
        pt = curve.getG().multiply(secexp);
    } else {
        var A = BigInteger.fromByteArrayUnsigned(chainXor);
        secexp = BigInteger.fromByteArrayUnsigned(privKey);
        pt = ECPointFp.decodeFrom(curve.getCurve(), pubKey).multiply(A);
    }

    var newPriv = secexp.toByteArrayUnsigned();
    var newPub = pt.getEncoded();
    var h160 = Bitcoin.Util.sha256ripe160(newPub);
    var addr = new Bitcoin.Address(h160);
    var sec = new Bitcoin.Address(newPriv);
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
    for (var i = 0; i < 4; i++) {
        var bytes = key.slice(i * 16, i * 16 + 16);
        var cs = Crypto.SHA256(Crypto.SHA256(bytes, {asBytes: true}), {asBytes: true});
        var str = Crypto.util.bytesToHex(bytes.concat(cs.slice(0,2)));
        var code = armory_map(str, armory_t, armory_f);
        var arr = [];
        for (var j = 0; j < 9; j++)
            arr.push(code.substr(j*4, 4));
        var code = arr.join(' ');
        res.push(code);
    }
    var str = res.join('\n');
    console.log(str);
    return str;
}

function armory_decode_keys(data) {
    var keys = data.split('\n');
    var lines = [];
    for (var i = 0; i < keys.length; i++) {
        var k = keys[i].replace(' ','');
        var raw = Crypto.util.hexToBytes(armory_map(k, armory_f, armory_t));
        var data = raw.slice(0, 16);
        var chk = raw.slice(16, 2);
        lines.push(data);
    }
    var privKey = lines[0].concat(lines[1]);
    var chainCode = lines[2].concat(lines[3]);
    return [privKey, chainCode];
}

function armory_get_pubkey(privKey) {
    var curve = getSECCurveByName("secp256k1");
    var secexp = BigInteger.fromByteArrayUnsigned(privKey);
    var pt = curve.getG().multiply(secexp);
    var pubKey = pt.getEncoded();
    return pubKey;
}

var Armory = new function () {
    var pubKey;
    var privKey;
    var chainCode;
    var range;
    var counter;
    var timeout;

    self.calcAddr = function() {
        var r = armory_extend_chain(pubKey, chainCode, privKey, true);
        onUpdate(r);
        pubKey = r[2];
        privKey = r[3];
        counter++;
        if (counter < range) {
            timeout = setTimeout(self.calcAddr, 0);
        } else {
            if (onSuccess) onSuccess();
        }
    }

    self.gen = function(seed, _range, update, success) {
        var keys = armory_decode_keys(seed);
        privKey = keys[0];
        chainCode = keys[1];
        pubKey = armory_get_pubkey(privKey);
        range = _range;
        counter = 0;
        onUpdate = update;
        onSuccess = success;
        clearTimeout(timeout);
        calcAddr();
    };

    return self;
};

var armory_test_codes = 
'atuw tnde sghh utho sudi ekgk ohoj odwd ojhw\n\
ueis hnrt fsht fjes gsgg gswg eutd duus ftfs\n\
jgjs fghg waug hjah faaw tksn gwig hrrr tdot\n\
kjuu oeuj kdun adst gfug howu jjes fndd fref';

function armory_test() {
    Armory.gen(armory_test_codes, 5, function(r) { console.log(r); } );
}


