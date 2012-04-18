/*
    electrum.js : Electrum-like deterministic key generator (public domain).
*/

var ELECTRUM_ROUNDS = 100000; // wallet ver.4

function electrum_extend_chain(pubKey, privKey, n, for_change, fromPrivKey) {
    var curve = getSECCurveByName("secp256k1");

    var mode = for_change ? 1 : 0;
    var mpk = pubKey.slice(1);
    var bytes = Crypto.charenc.UTF8.stringToBytes(n + ':' + mode + ':').concat(mpk);
    var sequence = Crypto.SHA256(Crypto.SHA256(bytes, {asBytes: true}), {asBytes: true})

    var secexp;
    var pt = ECPointFp.decodeFrom(curve.getCurve(), pubKey);

    if (fromPrivKey) {

        var A = BigInteger.fromByteArrayUnsigned(sequence);
        var B = BigInteger.fromByteArrayUnsigned(privKey);
        var C = curve.getN();
        secexp = A.add(B).mod(C);
        pt = pt.add(curve.getG().multiply(A));

    } else {

        var A = BigInteger.fromByteArrayUnsigned(sequence);
        secexp = BigInteger.fromByteArrayUnsigned(privKey)
        pt = pt.add(curve.getG().multiply(A));

    }

    var newPriv = secexp.toByteArrayUnsigned();
    var newPub = pt.getEncoded();
    var h160 = Bitcoin.Util.sha256ripe160(newPub);
    var addr = new Bitcoin.Address(h160);
    var sec = new Bitcoin.Address(newPriv);
    sec.version = 128;

    return [addr.toString(), sec.toString(), newPub, newPriv];
}

function electrum_get_pubkey(privKey) {
    var curve = getSECCurveByName("secp256k1");
    var secexp = BigInteger.fromByteArrayUnsigned(privKey);
    var pt = curve.getG().multiply(secexp);
    var pubKey = pt.getEncoded();
    return pubKey;
}

// proof of concept
function electrum_calc_keys(_seed, range) {
    var seed = Crypto.charenc.UTF8.stringToBytes(_seed);

    // strengthening key : seed -> a few rounds of sha256 -> privKey
    var oldseed = seed.slice(0);
    for (var i = 0; i < ELECTRUM_ROUNDS; i++)
        seed = Crypto.SHA256(seed.concat(oldseed), {asBytes: true});

    var privKey = seed;
    var pubKey = electrum_get_pubkey(privKey);

    // calculating addresses
    var addr = [];
    for (var i = 0; i < range; i++)
        addr.push(electrum_extend_chain(pubKey, privKey, i, false, true));

    return addr;
}

var Electrum = new function () {
    var seed;
    var oldseed;
    var pubKey;
    var privKey;
    var rounds;
    var range;
    var counter;
    var timeout;
    var onUpdate;
    var onSuccess;

    function calcSeed() {
        if (rounds > 0) {

            onUpdate(rounds, seed);

            var portion = ELECTRUM_ROUNDS / 100;

            for (var i = 0; i < portion; i++)
                seed = Crypto.SHA256(seed.concat(oldseed), {asBytes: true});

            rounds -= portion;

            if (rounds > 0) {
                timeout = setTimeout(calcSeed, 0);
            } else {
                privKey = seed;
                pubKey = electrum_get_pubkey(privKey);
                onSuccess(privKey);
            }
        }
    }

    function calcAddr() {
        var r = electrum_extend_chain(pubKey, privKey, counter, false, true);
        onUpdate(r);
        counter++;
        if (counter < range) {
            timeout = setTimeout(calcAddr, 0);
        } else {
            if (onSuccess) onSuccess();
        }
    }

    // public init(seed, update(rounds), success(privKey))
    this.init = function(_seed, update, success) {
        seed = Crypto.charenc.UTF8.stringToBytes(_seed);
        oldseed = seed.slice(0);
        rounds = 100000;
        onUpdate = update;
        onSuccess = success;
        clearTimeout(timeout);
        calcSeed();
    };

    // public generate(range, update(address), success())
    this.gen = function(_range, update, success) {
        range = _range;
        counter = 0;
        onUpdate = update;
        onSuccess = success;
        clearTimeout(timeout);
        calcAddr();
    };

    this.stop = function() {
        clearTimeout(timeout);
    }

    return this;
};

function _electrum_update(r) {
    console.log(r);
}

function _electrum_success(privKey) {
    console.log(Crypto.util.bytesToHex(privKey));
    Electrum.gen(5, _update);
}

function electrum_test() {

    var seed = '123456';

    Electrum.init(seed, _electrum_update, _electrum_success);

    /*
    83945f4f3bb9d14119daa0f4b44fdd20b190c8220398f06c0fa69ec2ae5fe01c
    1CZSNhisnmSdDe8Kqd84UNxVZr1ZF3dwtv
    19ooYkLtiwqPuFmLxSEDqqgCKhPLSKx1nv
    17Y2QAMMPGT4BWpaCZKd8iAGkwiognVETZ
    14zJFDxT5fk1F6NDJyj5sb3CQfhouzkfpw
    1JqiMeAcWx2pz5rfccpcDyPiwtFdDEGJbz
    */
}
