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

function armory_test() {
    var armory_test_codes = 
'atuw tnde sghh utho sudi ekgk ohoj odwd ojhw\n\
ueis hnrt fsht fjes gsgg gswg eutd duus ftfs\n\
jgjs fghg waug hjah faaw tksn gwig hrrr tdot\n\
kjuu oeuj kdun adst gfug howu jjes fndd fref';
    Armory.gen(armory_test_codes, 5, function(r) { console.log(r); } );
}
