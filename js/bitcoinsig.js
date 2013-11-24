/*
    bitcoinsig.js - sign and verify messages with bitcoin address (public domain)
*/

function msg_numToVarInt(i) {
    if (i < 0xfd) {
      return [i];
    } else if (i <= 0xffff) {
      // can't use numToVarInt from bitcoinjs, BitcoinQT wants big endian here (!)
      return [0xfd, i & 255, i >>> 8];
    } else {
        throw ("message too large");
    }
}

function msg_bytes(message) {
    var b = Crypto.charenc.UTF8.stringToBytes(message);
    return msg_numToVarInt(b.length).concat(b);
}

function msg_digest(message) {
    var b = msg_bytes("Bitcoin Signed Message:\n").concat(msg_bytes(message));
    return Crypto.SHA256(Crypto.SHA256(b, {asBytes:true}), {asBytes:true});
}

function verify_message(signature, message, addrtype) {
    try {
        var sig = Crypto.util.base64ToBytes(signature);
    } catch(err) {
        return false;
    }

    if (sig.length != 65)
        return false;

    // extract r,s from signature
    var r = BigInteger.fromByteArrayUnsigned(sig.slice(1,1+32));
    var s = BigInteger.fromByteArrayUnsigned(sig.slice(33,33+32));

    // get recid
    var compressed = false;
    var nV = sig[0];
    if (nV < 27 || nV >= 35)
        return false;
    if (nV >= 31) {
        compressed = true;
        nV -= 4;
    }
    var recid = BigInteger.valueOf(nV - 27);

    var ecparams = getSECCurveByName("secp256k1");
    var curve = ecparams.getCurve();
    var a = curve.getA().toBigInteger();
    var b = curve.getB().toBigInteger();
    var p = curve.getQ();
    var G = ecparams.getG();
    var order = ecparams.getN();

    var x = r.add(order.multiply(recid.divide(BigInteger.valueOf(2))));
    var alpha = x.multiply(x).multiply(x).add(a.multiply(x)).add(b).mod(p);
    var beta = alpha.modPow(p.add(BigInteger.ONE).divide(BigInteger.valueOf(4)), p);
    var y = beta.subtract(recid).isEven() ? beta : p.subtract(beta);

    var R = new ECPointFp(curve, curve.fromBigInteger(x), curve.fromBigInteger(y));
    var e = BigInteger.fromByteArrayUnsigned(msg_digest(message));
    var minus_e = e.negate().mod(order);
    var inv_r = r.modInverse(order);
    var Q = (R.multiply(s).add(G.multiply(minus_e))).multiply(inv_r);

    var public_key = Q.getEncoded(compressed);
    var addr = new Bitcoin.Address(Bitcoin.Util.sha256ripe160(public_key));

    addr.version = addrtype ? addrtype : 0;
    return addr.toString();
}

function sign_message(private_key, message, compressed, addrtype) {
    if (!private_key)
        return false;

    var signature = private_key.sign(msg_digest(message));
    var address = new Bitcoin.Address(private_key.getPubKeyHash());
    address.version = addrtype ? addrtype : 0;

    //convert ASN.1-serialized signature to bitcoin-qt format
    var obj = Bitcoin.ECDSA.parseSig(signature);
    var sequence = [0];
    sequence = sequence.concat(obj.r.toByteArrayUnsigned());
    sequence = sequence.concat(obj.s.toByteArrayUnsigned());

    for (var i = 0; i < 4; i++) {
        var nV = 27 + i;
        if (compressed)
            nV += 4;
        sequence[0] = nV;
        var sig = Crypto.util.bytesToBase64(sequence);
        if (verify_message(sig, message, addrtype) == address)
            return sig;
    }

    return false;
}

function bitcoinsig_test() {
    var k = '5JeWZ1z6sRcLTJXdQEDdB986E6XfLAkj9CgNE4EHzr5GmjrVFpf';
    var a = '17mDAmveV5wBwxajBsY7g1trbMW1DVWcgL';
    var s = 'HDiv4Oe9SjM1FFVbKk4m3N34efYiRgkQGGoEm564ldYt44jHVTuX23+WnihNMi4vujvpUs1M529P3kftjDezn9E=';
    var m = 'test message';
    payload = Bitcoin.Base58.decode(k);
    secret = payload.slice(1, 33);
    compressed = payload.length == 38;
    console.log(verify_message(s, m));
    sig = sign_message(new Bitcoin.ECKey(secret), m, compressed);
    console.log(verify_message(sig, m));
}

if (typeof require != 'undefined' && require.main === module) {
    window = global; navigator = {}; Bitcoin = {};
    eval(require('fs').readFileSync('./bitcoinjs-min.js')+'');
    eval(require('path').basename(module.filename,'.js')+'_test()');
}
