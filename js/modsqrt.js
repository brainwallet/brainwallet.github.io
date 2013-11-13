
/*
 * ModSqrt borrowed and translated from http://eli.thegreenplace.net/2009/03/07/computing-modular-square-roots-in-python/
 */
function LegendreSymbol(a, p) {
    var r = a.modPow(p.subtract(BigInteger.ONE).divide(new BigInteger("2")), p);
    if( r.equals(p.subtract(BigInteger.ONE)) ) return new BigInteger("-1");
    return r;
}

/* return `ret' such that ret^2 = this (mod p) */
function bnModSqrt(p) {
    var TWO = new BigInteger("2");
    var NEG_ONE = new BigInteger("-1");

    if( !(LegendreSymbol(this, p).equals(BigInteger.ONE)) ) 
        return BigInteger.ZERO;

    if( this.equals(BigInteger.ZERO) )
        return BigInteger.ZERO;

    if( p.equals(TWO) )
        return p;

    if( p.mod(new BigInteger("4")).equals(new BigInteger("3")) )
        return this.modPow(p.add(BigInteger.ONE).divide(new BigInteger("4")), p);

    var s = p.subtract(BigInteger.ONE);
    var e = 0;

    while( s.mod(TWO).equals(BigInteger.ZERO) ) {
        s = s.divide(TWO);
        e += 1;
    }

    // find some legendre symbol n|p = -1
    var n = TWO;
    while( !LegendreSymbol(n, p).equals(NEG_ONE) ) {
        n = n.add(BigInteger.ONE);
    }

    console.log("LegendreSymbol found: " + n);

    /*
     * Here be dragons!
     * Read the paper "Square roots from 1; 24, 51,
     * 10 to Dan Shanks" by Ezra Brown for more
     * information
     *
     * x is a guess of the square root that gets better
     * with each iteration.
     * b is the "fudge factor" - by how much we're off
     * with the guess. The invariant x^2 = ab (mod p)
     * is maintained throughout the loop.
     * g is used for successive powers of n to update
     * both a and b
     * r is the exponent - decreases with each update
     */
    var x = this.modPow(s.add(BigInteger.ONE).divide(TWO), p);
    var b = this.modPow(s, p);
    var g = n.modPow(s, p);
    var r = e;
    var q = BigInteger.ZERO.clone();

    while(true) {
        var t = b.clone();
        var m = 0;

        for( ; m < r; m += 1 ) {
            if(t.equals(BigInteger.ONE))
                break;
            t = t.modPow(TWO, p);
        }

        if( m == 0 )
            return x;

        q.fromInt(r - m - 1);

        var gs = g.modPow(TWO.pow(q), p);
        g = gs.multiply(gs).mod(p);
        x = x.multiply(gs).mod(p);
        b = b.multiply(g).mod(p);
        r = m;
    }
}

BigInteger.prototype.modSqrt = bnModSqrt;

$(document).ready( function() {
    return; // Comment out to run tests

    var ecparams = getSECCurveByName("secp256k1");
    console.log(ecparams);

    var test_modsqrt = function(compressed_key_str, check_y_str) {
        var key_bytes = Crypto.util.hexToBytes(compressed_key_str);
        console.log(key_bytes);

        var y_bit = u8(key_bytes.slice(0, 1)) & 0x01;
        var x     = BigInteger.ZERO.clone();
        x.fromString(Crypto.util.bytesToHex(key_bytes.slice(1, 33)), 16);
        console.log('x = ' + Crypto.util.bytesToHex(x.toByteArrayUnsigned()));

        var curve = ecparams.getCurve();
        var a = curve.getA().toBigInteger();
        var b = curve.getB().toBigInteger();
        var p = curve.getQ();

        var tmp = x.multiply(x).multiply(x).add(a.multiply(x)).add(b).mod(p);
        console.log('tmp = ' + Crypto.util.bytesToHex(tmp.toByteArrayUnsigned()));

        var y = tmp.modSqrt(p);

        if( (y[0] & 0x01) != y_bit ) {
            y = y.multiply(new BigInteger("-1")).mod(p);
        }

        console.log('y = ' + Crypto.util.bytesToHex(y.toByteArrayUnsigned()));

        var check_y = BigInteger.ZERO.clone();
        check_y.fromString(check_y_str, 16);

        if( !y.equals(check_y) ) {
            alert("Error in modSqrt");
        }
    }

    // ECDSA private key (random number / secret exponent) = 863abb33f3e3305a78f56285c5aa42bcf85c2cdef2cface9346c65233da4e3e1
    // ECDSA public key (uncompressed) = 04aeb681df5ac19e449a872b9e9347f1db5a0394d2ec5caf2a9c143f86e232b0d9eb0124240d225ed0ccfb2dfa9ad05d1e5e0c7941ee5c518b398145f202cb1d13
    // ECDSA public key (compressed) = 03aeb681df5ac19e449a872b9e9347f1db5a0394d2ec5caf2a9c143f86e232b0d9
    test_modsqrt('03aeb681df5ac19e449a872b9e9347f1db5a0394d2ec5caf2a9c143f86e232b0d9', 'eb0124240d225ed0ccfb2dfa9ad05d1e5e0c7941ee5c518b398145f202cb1d13');

    // ECDSA private key (random number / secret exponent) = 7a26b3657dfa753a6a32962fde76e2d8202b3eaa1603270119ce4156472c4d20
    // ECDSA public key (uncompressed) = 042ba95457d7274368a191d43cc379e357ba577d7a24262ae375cca78a2224f3f011a0fed69a15c28dea6f433255dc765403794c562a444015b996f7ac234141d8
    // ECDSA public key (compressed) = 022ba95457d7274368a191d43cc379e357ba577d7a24262ae375cca78a2224f3f0
    test_modsqrt('022ba95457d7274368a191d43cc379e357ba577d7a24262ae375cca78a2224f3f0', '11a0fed69a15c28dea6f433255dc765403794c562a444015b996f7ac234141d8');

});
