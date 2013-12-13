/* ************************************************************ 

   QR-Logo: http://qrlogo.kaarposoft.dk

   Copyright (C) 2011 Henrik Kaare Poulsen

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

     http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
*/


/* ************************************************************ */
/* Settings for http://www.jslint.com/
*/

/*jslint browser: true */
/*jslint bitwise: true */
/*jslint vars: true */
/*jslint white: true */
/*jslint plusplus: true */
/*jslint continue: true */
/*global alert: true */
/*global ReedSolomon: true */


/* ************************************************************ */
/* JavaScript STRICT mode
*/
"use strict";


/* ************************************************************
 * QRCodeDecode CONSTRUCTOR
 * ************************************************************
 */

/** @class
 *  Encode or decode QR Code
 */

function QRCodeDecode() {

	this.logger = null;

	this.debug_addText = true;
	this.debug_encodeWithErrorCorrection = true;
	this.debug_encodeBestMask = true;
	this.debug_addErrorCorrection = true;
	this.debug_setBlocks = true;
	this.debug_findModuleSize = true;
	this.debug_extractCodewords = true;
	this.debug_extractData = true;
	this.debug_correctErrors = true;

	this.debug_insane = false;

	this.image = null;

	this.image_top = 0;
	this.image_bottom = 0;
	this.image_left = 0;
	this.image_right = 0;

	this.n_modules = 0;
	this.module_size = 0;
	this.version = 0;
	this.functional_grade = 0;
	this.error_correction_level = 0;
	this.mask = 0;

	this.mask_pattern = [];

	this.n_block_ec_words = 0;
	this.block_indices = [];
	this.block_data_lengths = [];
}


/* ************************************************************
 * QRCodeDecode PROTOTYPE
 * ************************************************************
 */

QRCodeDecode.prototype = {

	/* ************************************************************
	 * QRCodeDecode CONSTANTS
	 * ************************************************************
	 */

	/** Mode according to ISO/IEC 18004:2006(E) Section 6.3 */
	MODE: {
		Numeric: 1,
		AlphaNumeric: 2,
		EightBit: 4,
		Terminator: 0
	},

	/** Error correction level according to ISO/IEC 18004:2006(E) Section 6.5.1 */
	ERROR_CORRECTION_LEVEL: {
		L: 1,	//  7%
		M: 0,	// 15%  
		Q: 3,	// 25%
		H: 2	// 30%
	},


	/* ************************************************************
	 * QRCodeDecode MAIN ENCODE FUNCTIONS TO BE CALLED BY CLIENTS
	 * ************************************************************
	 */

	/**  Encode a text into a QR Code in a canvas
	 *
	 * @param mode          Mode according to ISO/IEC 18004:2006(E) Section 6.3
	 * @param text          The text to be encoded
	 * @param version       Version according to ISO/IEC 18004:2006(E) Section 5.3.1
	 * @param ec_level      Error correction level according to ISO/IEC 18004:2006(E) Section 6.5.1
	 * @param module_size   Number of pixels per module
	 * @param canvas        The canvas to encode into
	 * @param bg_rgb        Array [r, g, b] where 0<=color<=255
	 * @param module_rgb    Array [r, g, b] where 0<=color<=255
	 */
	encodeToCanvas: function (mode, text, version, ec_level, module_size, canvas, bg_rgb, module_rgb) {

		if (!bg_rgb) { bg_rgb = [0.98, 0.98, 1.0]; }
		if (!module_rgb) { module_rgb = [0.3, 0.05, 0.05]; }

		var ctx = canvas.getContext('2d');

		canvas.setBackground = function () {
			ctx.fillStyle = "rgb(" + Math.round(bg_rgb[0]*255) + "," + Math.round(bg_rgb[1]*255) + "," + Math.round(bg_rgb[2]*255) + ")";
			ctx.fillRect(0, 0, canvas.width, canvas.height);
			ctx.fillStyle = "rgb(" + Math.round(module_rgb[0]*255) + "," + Math.round(module_rgb[1]*255) + "," + Math.round(module_rgb[2]*255) + ")";
		};

		canvas.setDark = function (x, y, d) {
			ctx.fillRect(x, y, d, d);
		};

		this.encodeInit(version, ec_level, module_size, canvas);
		this.encodeAddText(mode, text);
		this.encode();
	},


	/*  ************************************************************ */
	/** Encode text into a QR Code in a pixel array
	 *
	 *  @param mode      Mode according to ISO/IEC 18004:2006(E) Section 6.3
	 *  @param text      The text to be encoded
	 *  @param version   Version according to ISO/IEC 18004:2006(E) Section 5.3.1
	 *  @param ec_level  Error correction level according to ISO/IEC 18004:2006(E) Section 6.5.1
	 */

	encodeToPixarray: function (mode, text, version, ec_level) {

		var n_modules = this.nModulesFromVersion(version)+4+4;

		var pix = {};
		pix.width = n_modules;
		pix.height = n_modules;
		pix.arr = [];
		var i;
		for (i = 0; i < n_modules; i++) {
			pix.arr[i] = [];
		}

		pix.setBackground = function () {
			for (i = 0; i < n_modules; i++) {
				var j;
				for (j = 0; j < n_modules; j++) {
					this.arr[i][j] = false;
				}
			}
		};

		pix.setDark = function (x, y, d) {
			// Ignoring d, since a pixel array has d=1

			// TODO: Investigate why we have wrong X coordinate sometimes ???

			if (x > n_modules-1) { return; }
			this.arr[x][y] = true;
		};

		pix.isDark = function (x, y, d) {
			// Ignoring d, since a pixel array has d=1

			if (x > this.n_modules-1) { return false; }

			return pix.arr[x][y];
		};

		this.encodeInit(version, ec_level, 1, pix);
		this.encodeAddText(mode, text);
		this.encode();

		return pix;
	},


	/*  ************************************************************ */
	/** Prepare for encoding text to QR Code
	 *
	 *  @param version       Version according to ISO/IEC 18004:2006(E) Section 5.3.1
	 *  @param ec_level      Error correction level according to ISO/IEC 18004:2006(E) Section 6.5.1
	 *  @param module_size   Number of pixels per module
	 *  @param canvas        Canvas or pixel array
	 */
	encodeInit: function (version, ec_level, module_size, canvas) {

		this.version = version;
		this.error_correction_level = ec_level;
		this.module_size = module_size;
		this.n_modules = this.nModulesFromVersion(version);

		this.image = canvas;
		this.image_top = 4*module_size;
		this.image_left = 4*module_size;
		this.image.width = (4+4+this.n_modules)*module_size;
		this.image.height = (4+4+this.n_modules)*module_size;
		this.image.setBackground();

		this.bit_idx = 0;
		this.setBlocks();

		this.data = [];
		var i;
		for (i = 0; i < this.n_data_codewords; i++) { this.data[i] = 0; }

		this.pixels = [];
		for (i = 0; i < this.n_modules; i++) { this.pixels[i] = []; }

	},


	/*  ************************************************************ */
	/** Add text to a QR code
	 *
	 *  @param mode  Mode according to ISO/IEC 18004:2006(E) Section 6.3
	 *  @param text  The text to be encoded
	 */
	encodeAddText: function (mode, text) {
		this.addTextImplementation(mode, text);
	},


	/*  ************************************************************ */
	/** Encode this class to an image/canvas.
	*/
	encode: function () {
		this.addTextImplementation(this.MODE.Terminator, null);
		this.appendPadding();
		this.addErrorCorrection();
		this.encodeBestMask();
		this.pixelsToImage();
	},


	/* ************************************************************
	 * QRCodeDecode MAIN DECODE FUNCTIONS TO BE CALLED BY CLIENTS
	 * ************************************************************
	 */

	/**  Decode a pixel array */
	decodePixarray: function (pix) {
		return this.decodeImage(pix);
	},


	/*  ************************************************************ */
	/** Decode image data as QR Code
	 *
	 *  @param image_data    The image data (canvas.getContext('2d').getImageData, pixel array or similar)
	 *  @param image_width   The pixel width of the image
	 *  @param image_height  The pixel height of the image
	 */
	decodeImageData: function (image_data, image_width, image_height) {
		this.setImageData(image_data, image_width, image_height);
		return this.decode();
	},


	/*  ************************************************************ */
	/** Decode image data as QR Code
	 *
	 *  @param image_data    The image data (canvas.getContext('2d').getImageData, pixel array or similar)
	 *  @param image_width   The pixel width of the image
	 *  @param image_height  The pixel height of the image
	 *  @param left          Leftmost pixel of image
	 *  @param right         Rightmost pixel of image
	 *  @param top           Top pixel of image
	 *  @param bottom        Bottom pixel of image
	 *  @param max_version   Do not try to decode with version higher than this
	 */
	decodeImageDataInsideBordersWithMaxVersion: function (image_data, image_width, image_height, left, right, top, bottom, max_version) {
		this.setImageData(image_data, image_width, image_height);
		this.image_left = left;
		this.image_right = right;
		this.image_top = top;
		this.image_bottom = bottom;
		this.image_size = ( (this.image_right-this.image_left+1) + (this.image_bottom-this.image_top+1) ) / 2.0;
		this.max_version = max_version;
		return this.decodeInsideBordersWithMaxVersion();
	},


	/*  ************************************************************ */
	/** Set image data in preparation for decoding QR Code
	 *
	 *  @param image_data    The image data (canvas.getContext('2d').getImageData, pixel array or similar)
	 *  @param image_width   The pixel width of the image
	 *  @param image_height  The pixel height of the image
	 */

	setImageData: function (image_data, image_width, image_height) {

		image_data.min_col = 255;
		image_data.max_col = 0;
		var total = 0;
		var x, y;
		for (x = 0; x < image_width; x++) {
			for (y = 0; y < image_height; y++) {
				var p = x*4 + y*image_width*4;
				var v = 0.30*image_data.data[p] + 0.59*image_data.data[p+1] + 0.11*image_data.data[p+2];
				total += v;
				if (v < image_data.min_col) { image_data.min_col = v; }
				if (v > image_data.max_col) { image_data.max_col = v; }
			}
		}

		if (image_data.max_col-image_data.min_col < 255/10) {
			throw ("Image does not have enough contrast (this.image_data.min_col=" + image_data.min_col + " this.image_data.max_col=" + image_data.max_col+")");
		}
		image_data.threshold = total / (image_width*image_height);
		//image_data.threshold = (image_data.max_col+image_data.min_col)/2;

		image_data.getGray = function (x, y, d) {
			var n = 0;
			var i;
			for (i = x; i < x+d; i++) {
				var j;
				for (j = y; j < y+d; j++) {
					var p = i*4 + j*this.width*4;
					n = n + 0.30*this.data[p] + 0.59*this.data[p+1] + 0.11*this.data[p+2];
				}
			}
			return n/d/d;
		};

		image_data.isDark = function (x, y, d) {
			var g = this.getGray(x, y, d);
			return g < this.threshold;
		};

		this.image = image_data;
	},


	/*  ************************************************************ */
	/** Decode a QR Code in an image.
	 *  The image MUST already have .getGray set
	 */
	decodeImage: function (image) {
		this.image = image;
		return this.decode();
	},


	/*  ************************************************************ */
	/** Decode a QR Code in an image which has already been set.
	 */
	decode: function () {
		this.findImageBorders();
		this.max_version = 40;
		this.decodeInsideBordersWithMaxVersion();
		return this.data;
	},


	/*  ************************************************************ */
	/** Decode a QR Code in an image which has already been set -
	 *  inside borders already defined
	 */
	decodeInsideBordersWithMaxVersion: function () {
		this.findModuleSize();
		this.setFunctionalPattern();
		this.extractCodewords();
		this.setBlocks();
		this.correctErrors();
		this.extractData();
		return this.data;
	},



	/* ************************************************************
	 * QRCodeDecode INTERNAL ENCODING FUNCTIONS
	 * ************************************************************
	 */

	addTextImplementation: function (mode, text) {

		function appendBits(bytes, pos, len, value) {
			var byteIndex = pos >>> 3;
			var shift = 24 - (pos & 7) - len;

			var v = value << shift;

			bytes[byteIndex+2] = v & 0xFF;
			v = v >>> 8;
			bytes[byteIndex+1] = v & 0xFF;
			v = v >>> 8;
			bytes[byteIndex] += v & 0xFF;
		}

		/* ************************************************************ */
		function getAlphaNum(qr, ch) {
			if (!qr.alphanum_rev.hasOwnProperty(ch)) {
				throw ("Invalid character for Alphanumeric encoding [" + ch + "]");
			}
			return qr.alphanum_rev[ch];
		}

		/* ************************************************************ */
		function addAlphaNum(qr, text) {
			var n = text.length;
			var n_count_bits = qr.nCountBits(qr.MODE.AlphaNumeric, qr.version);
			appendBits(qr.data, qr.bit_idx, n_count_bits, n);
			qr.bit_idx += n_count_bits;

			var i;
			for (i = 0; i < n-1; i += 2) {
				var val = 45 * getAlphaNum(qr, text[i]) + getAlphaNum(qr, text[i+1]);
				appendBits(qr.data, qr.bit_idx, 11, val);
				qr.bit_idx += 11;
			}
			if (n%2) {
				appendBits(qr.data, qr.bit_idx, 6, getAlphaNum(qr, text[n-1]));
				qr.bit_idx += 6;
			}
		}

		/* ************************************************************ */
		function add8bit(qr, text) {

			var n_count_bits = qr.nCountBits(qr.MODE.EightBit, qr.version);

			appendBits(qr.data, qr.bit_idx, n_count_bits, text.length);
			qr.bit_idx += n_count_bits;

			var i;
			for (i = 0; i < text.length; i++) {
				appendBits(qr.data, qr.bit_idx, 8, text[i].charCodeAt());
				qr.bit_idx += 8;
			}
		}

		/* ************************************************************ */
		function addNumeric(qr, text) {
			var n = text.length;
			var n_count_bits = qr.nCountBits(qr.MODE.Numeric, qr.version);
			appendBits(qr.data, qr.bit_idx, n_count_bits, n);
			qr.bit_idx += n_count_bits;

			var num = [];
			var val;
			var i;
			for (i = 0; i < n; i++) {
				var ch = text[i].charCodeAt()-48;
				if ( (ch<0) || (ch>9) ) { 
					throw ("Invalid character for Numeric encoding [" + text[i] + "]");
				}
				num.push(ch);
			}

			for (i = 0; i < n-2; i += 3) {
				val = 100*num[i]+10*num[i+1]+num[i+2];
				appendBits(qr.data, qr.bit_idx, 10, val);
				qr.bit_idx += 10;

			}
			if (n%3 === 1) {
				val = num[n-1];
				appendBits(qr.data, qr.bit_idx, 4, val);
				qr.bit_idx += 4;
			} else if (n%3 === 2) {
				val = 10*num[n-2]+num[n-1];
				appendBits(qr.data, qr.bit_idx, 7, val);
				qr.bit_idx += 7;
			}
		}


		/* ************************************************************
		 * addTextImplementation
		 */

		appendBits(this.data, this.bit_idx, 4, mode);
		this.bit_idx += 4;

		if (mode === this.MODE.AlphaNumeric) { addAlphaNum(this, text); }
		else if (mode === this.MODE.EightBit) { add8bit(this, text); }
		else if (mode === this.MODE.Numeric) { addNumeric(this, text); }
		else if (mode === this.MODE.Terminator) { return; }
		else { throw ("Unsupported ECI mode: " + mode); }

		if (this.debug_addText) {
			if (this.logger) {
				this.logger.debug("addTextImplementation data = " + this.data.join(","));
			}
		}

		if (this.debug_addText) {
			if (this.logger) {
				this.logger.debug("addTextImplementation bit_idx/8=" + this.bit_idx/8 + " n=" + this.n_data_codewords);
			}
		}

		if (this.bit_idx/8 > this.n_data_codewords) {
			throw ("Text too long for this EC version");
		}

	},


	/* ************************************************************ */
	appendPadding: function () {
		var i;
		for (i = Math.floor((this.bit_idx-1)/8)+1; i < this.n_data_codewords; i+=2) {
			this.data[i] = 0xEC;
			this.data[i+1] = 0x11;
		}
	},


	/* ************************************************************ */
	addErrorCorrection: function () {
		if (this.debug_addText) {
			if (this.logger) {
				this.logger.debug("addErrorCorrection data = " + this.data.join(","));
			}
		}

		var rs = new ReedSolomon(this.n_block_ec_words);
		if (this.debug_addErrorCorrection) { rs.logger = this.logger; }

		var bytes = [];

		var n = 0;
		var b;
		for (b = 0; b < this.block_data_lengths.length; b++) {

			var m = this.block_data_lengths[b];
			var bytes_in = this.data.slice(n, n+m);
			n += m;

			var i;
			for (i = 0; i < m; i++) {
				bytes[this.block_indices[b][i]] = bytes_in[i];
			}

			var bytes_out = rs.encode(bytes_in);

			for (i = 0; i < bytes_out.length; i++) {
				bytes[this.block_indices[b][m+i]] = bytes_out[i];
			}

		}

		if (this.debug_addErrorCorrection) {
			if (this.logger) {
				this.logger.debug("addErrorCorrection bytes = " + bytes.join(","));
			}
		}

		this.bytes = bytes;

	},


	/* ************************************************************ */
	calculatePenalty: function (mask) {

		// TODO: Verify all penalty calculations

		/* ************************************************************ */
		function penaltyAdjacent(qr) {
			var p = 0;
			var i;
			for (i = 0; i < qr.n_modules; i++) {
				var n_dark = [0, 0];
				var n_light = [0, 0];
				var rc;
				for (rc = 0; rc <= 1; rc++) {
					var j;
					for (j = 0; j < qr.n_modules; j++) {
						if (qr.pixels[rc*i+(1-rc)*j][(1-rc)*i+rc*j]) {
							if (n_light[rc] > 5) { p += (3+n_light[rc]-5); }
							n_light[rc] = 0;
							n_dark[rc]++;
						} else {
							if (n_dark[rc] > 5) { p += (3+n_dark[rc]-5); } 
							n_light[rc]++;
							n_dark[rc] = 0;
						}
					}
					if (n_light[rc] > 5) { p += (3+n_light[rc]-5); }
					if (n_dark[rc] > 5) { p += (3+n_dark[rc]-5); }
				}
			}
			return p;
		}

		/* ************************************************************ */
		function penaltyBlocks(qr) {
			// Not clear from ISO standard, if blocks have to be rectangular?
			// Here we give 3 penalty to every 2x2 block, so odd shaped areas will have penalties as well as rectangles
			var p = 0;
			var i;
			for (i = 0; i < qr.n_modules-1; i++) {
				var j;
				for (j = 0; j < qr.n_modules-1; j++) {
					var b = 0;
					if (qr.pixels[i]  [j]  ) { b++; }
					if (qr.pixels[i+1][j]  ) { b++; }
					if (qr.pixels[i]  [j+1]) { b++; }
					if (qr.pixels[i+1][j+1]) { b++; }
					if ( (b === 0) || (b === 4) )  { p += 3; }
				}
			}
			return p;
		}

		/* ************************************************************ */
		function binFormat(b) {
			return ("00000000000000" + b.toString(2)).slice(-15);			
		}

		/* ************************************************************ */
		function penaltyDarkLight(qr) {
			// we shift bits in one by one, and see if the resulting pattern match the bad one
			var p = 0;
			var bad = ( 128-1 - 2 - 32 ) << 4;	// 4_ : 1D : 1L : 3D : 1L : 1D : 4x
			var badmask1 = 2048 - 1 ;		// 4_ : 1D : 1L : 3D : 1L : 1D : 4L
			var badmask2 = badmask1 << 4;		// 4L : 1D : 1L : 3D : 1L : 1D : 4_
			var patmask = 32768 - 1;		// 4  +           7            + 4
			var i;
			for (i = 0; i < qr.n_modules-1; i++) {
				var pat = [0, 0];
				var j;
				for (j = 0; j < qr.n_modules-1; j++) {
					var rc;
					for (rc = 0; rc <= 1; rc++) {
						pat[rc] = (pat[rc]<<1)&patmask;
						if (qr.pixels[rc*i+(1-rc)*j][(1-rc)*i+rc*j]) { pat[rc]++; }
						if (qr.debug_insane) {
							qr.logger.debug(
								"PENALTY p=" + p +
								" x=" + (rc*i+(1-rc)*j) +
								" y=" + ((1-rc)*i+rc*j) +
								" pat=" + binFormat(pat[rc]) +
								" b1=" + binFormat(pat[rc]&badmask1) +
								" p2=" + binFormat(pat[rc]&badmask2) +
								" bad=" + binFormat(bad));
						}
						if (j>=7+4) {
							if ( (pat[rc]&badmask1) === bad ) {
								p += 40;
							} else {
								if (j<qr.n_modules-4-7) {
									if ( (pat[rc]&badmask2) === bad ) { p += 40; }
								}
							}
						}
					}
				}
			}
			return p;
		}

		/* ************************************************************ */
		function penaltyDark(qr) {
			var dark = 0;
			var i;
			for (i = 0; i < qr.n_modules-1; i++) {
				var j;
				for (j = 0; j < qr.n_modules-1; j++) {
					if (qr.pixels[i][j]) { dark++; }
				}
			}
			return 10*Math.floor(Math.abs(dark/(qr.n_modules*qr.n_modules)-0.5)/0.05);
		}

		/* ************************************************************ */
		/* calculatePenalty
		*/

		var p_adjacent = penaltyAdjacent(this);
		var p_blocks = penaltyBlocks(this);
		var p_darkLight = penaltyDarkLight(this);
		var p_dark = penaltyDark(this);
		var p_total = p_adjacent + p_blocks + p_darkLight + p_dark;

		if (this.debug_encodeBestMask) {
			if (this.logger) {
				this.logger.debug("mask=" + mask + " penalty=" + p_total + " (" + p_adjacent + ", " + p_blocks + ", " + p_darkLight + ", " + p_dark + ")");
			}
		}

		return p_total;
	},


	/* ************************************************************ */
	encodeBestMask: function () {
		var best_mask = 0;
		var best_penalty = 999999;

		this.setFunctionalPattern();
		var mask;
		var i;
		var j;
		for (mask = 0; mask < 8; mask++) {
			for (i = 0; i < this.n_modules; i++)  {
				for (j = 0; j < this.n_modules; j++) {
					this.pixels[i][j]=false;
				}
			}
			this.encodeFunctionalPatterns(mask);
			this.encodeData(mask);
			var penalty = this.calculatePenalty(mask);
			if (penalty<best_penalty) {
				best_penalty = penalty;
				best_mask = mask;
			}
		}

		if (this.debug_encodeBestMask) {
			if (this.logger) {
				this.logger.debug("best_mask=" + best_mask + " best_penalty=" + best_penalty);
			}
		}

		this.mask = best_mask;
		if (this.mask !== 7) {
			for (i = 0; i < this.n_modules; i++) {
				for (j = 0; j < this.n_modules; j++)  {
					this.pixels[i][j]=false;
				}
			}
			this.encodeFunctionalPatterns(this.mask);
			this.encodeData(this.mask);
		}
	},


	/* ************************************************************ */
	encodeFunctionalPatterns: function (mask) {

		function encodeFinderPattern(qr, x, y) {

			var i, j;

			// Outer 7x7 black boundary
			for (i = 0; i <= 5; i++) {
				qr.pixels[x+i][y] = true;
				qr.pixels[x+6][y+i] = true;
				qr.pixels[x+6-i][y+6] = true;
				qr.pixels[x][y+6-i] = true;
			}

			// Inner 3*3 black box
			for (i = 2; i <= 4; i++) {
				for (j = 2; j <= 4; j++) {
					qr.pixels[x+i][y+j] = true;
				}
			}
		}

		/* ************************************************************ */
		function encodeVersionTopright(qr) {
			var pattern = qr.version_info[qr.version];
			var y;
			for (y = 0; y < 6; y++) {
				var x;
				for (x = qr.n_modules-11; x < qr.n_modules-11+3; x++) {
					if (pattern & 1) { qr.pixels[x][y]=true;	 } 
					pattern /= 2;
				}
			}
		}

		/* ************************************************************ */
		function encodeVersionBottomleft(qr) {
			var pattern = qr.version_info[qr.version];
			var x;
			for (x = 0; x < 6; x++) {
				var y;
				for (y = qr.n_modules-11; y < qr.n_modules-11+3; y++) {
					if (pattern & 1) { qr.pixels[x][y]=true; }
					pattern /= 2;
				}
			}
		}

		/* ************************************************************ */
		function encodeTimingPattern(qr, horizontal) {
			var i;
			for (i = 8; i < qr.n_modules-8; i += 2) {
				if (horizontal) {
					qr.pixels[i][6]=true;
				} else {
					qr.pixels[6][i]=true;
				}
			}
			
		}

		/* ************************************************************ */
		function encodeOneAlignmentPattern(qr, x, y) {

			// Outer 5x5 black boundary
			var i;
			for (i = 0; i <= 3; i++) {
				qr.pixels[x+i][  y] = true;
				qr.pixels[x+4][  y+i] = true;
				qr.pixels[x+4-i][y+4] = true;
				qr.pixels[x][    y+4-i] = true;
			}

			// center black
			qr.pixels[x+2][y+2] = true;
		}

		/* ************************************************************ */
		function encodeAlignmentPatterns(qr) {
			var n = qr.alignment_patterns[qr.version].length;
			var i;
			for (i = 0; i < n; i++) {
				var j;
				for (j = 0; j < n; j++) {
					if ( ((i===0)&&(j===0)) || ((i===0)&&(j===n-1)) || ((i===n-1)&&(j===0)) ) { continue; }
					encodeOneAlignmentPattern(qr, qr.alignment_patterns[qr.version][i]-2, qr.alignment_patterns[qr.version][j]-2); 
				}
			}
		}

		/* ************************************************************ */
		function encodeFormatNW(qr, code) {
			var x = 8;
			var y;
			for (y = 0; y <= 5; y++) {
				if (code&1) { qr.pixels[x][y] = true; }
				code /= 2;
			}
			if (code&1) { qr.pixels[8][7]=true; }
			code /= 2;
			if (code&1) { qr.pixels[8][8]=true; }
			code /= 2;
			if (code&1) { qr.pixels[7][8]=true; }
			code /= 2;

			y = 8;
			for (x = 5; x >= 0; x--) {
				if (code&1) { qr.pixels[x][y] = true; }
				code /= 2;
			}
		}

		/* ************************************************************ */
		function encodeFormatNESW(qr, code) {
			var y = 8;
			var x;
			for (x = qr.n_modules-1; x > qr.n_modules-1-8; x--) {
				if (code&1) { qr.pixels[x][y] = true; }
				code /= 2;
			}
			x = 8;
			for (y = qr.n_modules-7; y < qr.n_modules-1; y++) {
				if (code&1) { qr.pixels[x][y] = true; }
				code /= 2;
			}
		}

		/* ************************************************************
		 * encodeFunctionalPatterns
		 */

		encodeFinderPattern(this, 0, 0);
		encodeFinderPattern(this, 0, this.n_modules-7);
		encodeFinderPattern(this, this.n_modules-7, 0);

		if (this.version>=7) {
			encodeVersionTopright(this);
			encodeVersionBottomleft(this);
		}
		encodeTimingPattern(this, true);
		encodeTimingPattern(this, false);
		if (this.version > 1) { encodeAlignmentPatterns(this); }
		var code = this.format_info[mask+8*this.error_correction_level];
		encodeFormatNW(this, code);
		encodeFormatNESW(this, code);
	},


	/* ************************************************************ */
	encodeData: function (qrmask) {

		function setMasked(pixels, mask, j, i, f) {

			var m;
			switch (mask) {
				case 0:
					m = (i + j) % 2;
					break;
				case 1:
					m = i % 2;
					break;
				case 2:
					m = j % 3;
					break;
				case 3:
					m = (i + j) % 3;
					break;
				case 4:
					m = (Math.floor(i / 2) + Math.floor(j / 3)) % 2;
					break;
				case 5:
					m = (i * j) % 2 + (i * j) % 3;
					break;
				case 6:
					m = ((i * j) % 2 + (i * j) % 3) % 2;
					break;
				case 7:
					m = ((i+j) % 2 + (i * j) % 3) % 2;
					break;
			}
			if (m === 0) {
				pixels[j][i] = !f;
			} else {
				pixels[j][i] = f;
			}
		}

		/* ************************************************************ */
		/* encodeData
		*/

		var writingUp = true;
		var n = 0;
		var v = this.bytes[n];
		var bitsWritten = 0;
		var mask = (1<<7);
		var j;

		// Write columns in pairs, from right to left
		for (j = this.n_modules - 1; j > 0; j -= 2) {
			if (j === 6) {
				// Skip whole column with vertical alignment pattern;
				// saves time and makes the other code proceed more cleanly
				j--;
			}
			// Read alternatingly from bottom to top then top to bottom
			var count;
			for (count = 0; count < this.n_modules; count++) {
				var i = writingUp ? this.n_modules - 1 - count : count;
				var col;
				for (col = 0; col < 2; col++) {
					// Ignore bits covered by the function pattern
					if (!this.functional_pattern[j - col][i]) {
						setMasked(this.pixels, qrmask, j - col, i, v & mask);
						mask = (mask>>>1);
						bitsWritten++;
						if (bitsWritten === 8) {
							bitsWritten = 0;
							mask = (1<<7);
							n++;
							v = this.bytes[n];
						}
					}
				}
			}
			writingUp ^= true; // writingUp = !writingUp; // switch directions
		}

	},


	/* ************************************************************ */
	pixelsToImage: function () {
		var i, j;
		for (i = 0; i < this.n_modules; i++) {
			for (j = 0; j < this.n_modules; j++) {
				if (this.pixels[i][j]) { this.setDark(i, j); }
			}
		}
	},


	/* ************************************************************
	 * QRCodeDecode INTERNAL DECODING FUNCTIONS
	 * ************************************************************
	 */

	findImageBorders: function () {
		var i, j, n;
		var limit = 7;
		var skew_limit = 2;

		for (i = 0; i < this.image.width; i++) {
			n = 0;
			for (j = 0; j < this.image.height; j++) {
				n = n+this.image.isDark(i, j, 1);
			}
			if (n >= limit) { break; }
		}
		this.image_left = i;

		for (i = this.image.width-1; i >= 0; i--) {
			n = 0;
			for (j = 0; j < this.image.height; j++) {
				n = n+this.image.isDark(i, j, 1);
			}
			if (n >= limit) { break; }
		}
		this.image_right = i;

		for (j = 0; j < this.image.height; j++) {
			n = 0;
			for (i = 0; i < this.image.width; i++) {
				n = n+this.image.isDark(i, j, 1);
			}
			if (n >= limit) { break; }
		}
		this.image_top = j;

		for (j = this.image.height-1; j>=0; j--) {
			n = 0;
			for (i = 0; i < this.image.width; i++) {
				n = n+this.image.isDark(i, j, 1);
			}
			if (n >= limit) { break; }
		}
		this.image_bottom = j;

		if (this.logger) {
			this.logger.debug("left=" + this.image_left + " right=" + this.image_right + " top=" + this.image_top + " bottom=" + this.image_bottom);
		}

		if ( (this.image_right-this.image_left+1<21) || (this.image_bottom-this.image_top+1<21) ) {
			throw ("Found no image data to decode");
		}	

		if ( Math.abs( (this.image_right-this.image_left) - (this.image_bottom-this.image_top) ) > skew_limit ) {
			throw ("Image data is not rectangular");
		}	

		this.image_size = ( (this.image_right-this.image_left+1) + (this.image_bottom-this.image_top+1) ) / 2.0;
		if (this.logger) {
			this.logger.debug("size=" + this.image_size);
		}
	},


	/* ************************************************************ */
	findModuleSize: function () {

		/* returns number of matches found
		 * perferct is 8*8 = 64
		 */
		function matchFinderPattern(qr, x, y, quiet_x, quiet_y, module_size) {
			var i, j;
			var n = 0;

			// Outer 7x7 black boundary
			for (i = 0; i <= 5; i++) {
				if (qr.isDarkWithSize(x+i, y, module_size)) { n = n+1; }
				if (qr.isDarkWithSize(x+6, y+i, module_size)) { n = n+1; }
				if (qr.isDarkWithSize(x+6-i, y+6, module_size)) { n = n+1; }
				if (qr.isDarkWithSize(x, y+6-i, module_size)) { n = n+1; }
			}

			// Intermediate 5*5 white
			for (i = 0; i <= 3; i++) {
				if (!qr.isDarkWithSize(x+i+1, y+1, module_size)) { n = n+1; }
				if (!qr.isDarkWithSize(x+5, y+i+1, module_size)) { n = n+1; }
				if (!qr.isDarkWithSize(x+5-i, y+5, module_size)) { n = n+1; }
				if (!qr.isDarkWithSize(x+1, y+5-i, module_size)) { n = n+1; }
			}

			// Inner 3*3 black box
			for (i = 0; i <= 2; i++) {
				for (j = 0; j <= 2; j++) {
					if (qr.isDarkWithSize(3+x, 3+y, module_size)) { n = n+1; }
				}
			}

			// quiet area 
			for (i = 0; i <= 6; i++) {
				if (!qr.isDarkWithSize(x+quiet_x, y+i, module_size)) { n = n+1; }
				if (!qr.isDarkWithSize(x+i, y+quiet_y, module_size)) { n = n+1; }
			}

			// "bottom right" quiet area
				if (!qr.isDarkWithSize(x+quiet_x, y+quiet_y, module_size)) { n = n+1; }

			return n;
		}


		/* ************************************************************ */
		function matchTimingPattern(qr, horizontal, n_modules, module_size) {
			var n = 0;
			var x0 = 6;
			var y0 = 8;
			var dx = 0;
			var dy = 1;
			if (horizontal) {
				x0 = 8;
				y0 = 6;
				dx = 1;
				dy = 0;
			}
			var consecutive = 5;
			var ok = [];
			var c;
			for (c = 0; c < consecutive; c++) { ok.push(1); }
			var black = true;
			var i;
			for (i = 0; i < n_modules-8-8; i++) {
				var x = x0+i*dx;
				var y = y0+i*dy;
				//qr.logger.debug("matchTimingPattern x=" + x + " y=" + y);
				if (black === qr.isDarkWithSize(x, y, module_size)) {
					n++;
					ok.push(1);
				} else {
					ok.push(0);
				}
				black = !black;
				var last5 = 0;
				for (c = ok.length-consecutive; c < ok.length-1; c++) {
					if (ok[c]) { last5 = last5+1; }
				}
				if (last5 < 3) {
					//if (qr.logger) qr.logger.debug("matchTimingPattern i=" + i + " no 3 correct in last 5");
					return 0;
				}
			}
			return n;
		}

		/* ************************************************************ */
		function matchOneAlignmentPattern(qr, x, y, module_size) {
			var n = 0;
			var i;

			// Outer 5x5 black boundary
			for (i = 0; i <= 3; i++) {
				if (qr.isDarkWithSize(x+i,   y,     module_size)) { n = n+1; }
				if (qr.isDarkWithSize(x+4,   y+i,   module_size)) { n = n+1; }
				if (qr.isDarkWithSize(x+4-i, y+4,   module_size)) { n = n+1; }
				if (qr.isDarkWithSize(x,     y+4-i, module_size)) { n = n+1; }
			}

			// Intermediate 3*3 white
			for (i = 0; i <= 1; i++) {
				if (!qr.isDarkWithSize(x+i+1, y+1,   module_size)) { n = n+1; }
				if (!qr.isDarkWithSize(x+3,   y+i+1, module_size)) { n = n+1; }
				if (!qr.isDarkWithSize(x+3-i, y+3,   module_size)) { n = n+1; }
				if (!qr.isDarkWithSize(x+1,   y+3-i, module_size)) { n = n+1; }
			}

			// center black
			if (qr.isDarkWithSize(x+2, y+2, module_size)) { n = n+1; }

			return n;
		}

		/* ************************************************************ */
		function matchAlignmentPatterns(qr, version, module_size) {
			var a = 0;
			var n = qr.alignment_patterns[version].length;
			var i, j;
			for (i = 0; i < n; i++) {
				for (j = 0; j < n; j++) {
					if ( ((i===0)&&(j===0)) || ((i===0)&&(j===n-1)) || ((i===n-1)&&(j===0)) ) { continue; }
					var na = matchOneAlignmentPattern(qr, qr.alignment_patterns[version][i]-2, qr.alignment_patterns[version][j]-2, module_size); 
					if (na > 24) { a++; }
				}
			}
			return a;
		}

		/* ************************************************************ */
		function matchVersionCode(qr, pattern) {
			var v;
			for (v = 7; v <= 40; v++) {
				var hd = qr.hammingDistance(pattern, qr.version_info[v]);
				if (hd <= 3) { return [v, hd]; }
			}
			return [0, 4];
		}

		/* ************************************************************ */
		function matchVersionTopright(qr, n_modules, module_size) {
			var factor = 1;
			var pattern = 0;
			var x, y;
			for (y = 0; y < 6; y++) {
				for (x = n_modules-11; x < n_modules-11+3; x++) {
					if (qr.isDarkWithSize(x, y, module_size)) { pattern += factor; }
					factor *= 2;
				}
			}
			return matchVersionCode(qr, pattern);
		}

		/* ************************************************************ */
		function matchVersionBottomleft(qr, n_modules, module_size) {
			var factor = 1;
			var pattern = 0;
			var x, y;
			for (x = 0; x < 6; x++) {
				for (y = n_modules-11; y < n_modules-11+3; y++) {
					if (qr.isDarkWithSize(x, y, module_size)) { pattern += factor; }
					factor *= 2;
				}
			}
			return matchVersionCode(qr, pattern);
		}

		/* ************************************************************ */
		function matchFormatCode(qr, pattern) {
			var f;
			for (f = 0; f < 32; f++) {
				var hd = qr.hammingDistance(pattern, qr.format_info[f]);
				if (hd<=3) { return [f, hd]; }
			}
			return [0, 4];
		}

		/* ************************************************************ */
		function matchFormatNW(qr, n_modules, module_size) {
			var factor = 1;
			var pattern = 0;
			var x = 8;
			var y;
			for (y = 0; y <= 5; y++) {
				if (qr.isDarkWithSize(x, y, module_size)) { pattern+= factor; }
				factor *= 2;
			}
			if (qr.isDarkWithSize(8, 7, module_size)) { pattern+= factor; }
			factor *= 2;
			if (qr.isDarkWithSize(8, 8, module_size)) { pattern+= factor; }
			factor *= 2;
			if (qr.isDarkWithSize(7, 8, module_size)) { pattern+= factor; }
			factor *= 2;
			y = 8;
			for (x = 5; x >= 0; x--) {
				if (qr.isDarkWithSize(x, y, module_size)) { pattern+= factor; }
				factor *= 2;
			}
			return matchFormatCode(qr, pattern);
		}

		/* ************************************************************ */
		function matchFormatNESW(qr, n_modules, module_size) {
			var factor = 1;
			var pattern = 0;
			var x;
			var y = 8;
			for (x = n_modules-1; x > n_modules-1-8; x--) {
				if (qr.isDarkWithSize(x, y, module_size)) { pattern+= factor; }
				factor *= 2;
			}
			x = 8;
			for (y = n_modules-7; y < n_modules-1; y++) {
				if (qr.isDarkWithSize(x, y, module_size)) { pattern+= factor; }
				factor *= 2;
			}
			return matchFormatCode(qr, pattern);
		}

		/* ************************************************************ */
		function grade_finder_patterns(finder_pattern) {
			var g = 4;
			var i;
			for (i = 0; i < 3; i++) {
				g = g - (64-finder_pattern[i]);
			}
			if (g < 0) { g = 0; }
			return g;
		}

		/* ************************************************************ */
		function grade_timing_patterns(timing_pattern, n) {
			var t = (timing_pattern[0]+timing_pattern[1]) / (2*n);
			t = 1-t;
			if (t >= 0.14) { return 0; }
			if (t >= 0.11) { return 1; }
			if (t >= 0.07) { return 2; }
			if (t >= 0.00001) { return 3; }
			return 4;
		}

		/* ************************************************************ */
		function grade_alignment_patterns(alignment_patterns, n) {
			var a = alignment_patterns/n;
			a = 1-a;
			if (a >= 0.30) { return 0; }
			if (a >= 0.20) { return 1; }
			if (a >= 0.10) { return 2; }
			if (a >= 0.00001) { return 3; }
			return 4;
		}

		/* ************************************************************ */
		function matchVersion(qr, version) {
			var g;
			var grades = [];
			var n_modules = qr.nModulesFromVersion(version);
			var module_size = qr.image_size/n_modules;
			var finder_pattern = [0, 0, 0];
			finder_pattern[0] = matchFinderPattern(qr, 0,           0,           7,	7, module_size);
			if (finder_pattern[0]<64-3) {
				return [version, 0]; // performance hack!
			}
			finder_pattern[1] = matchFinderPattern(qr, 0,           n_modules-7, 7,	-1, module_size);
			if (finder_pattern[0]+finder_pattern[1]<64+64-3) {
				return [version, 0]; // performance hack!
			}
			finder_pattern[2] = matchFinderPattern(qr, n_modules-7, 0,           -1,	7, module_size);
			if (qr.debug_findModuleSize) {
				if (qr.logger) {
					qr.logger.debug("matchVersion version=" + version +
						" finder0=" + finder_pattern[0] +
						" finder1=" + finder_pattern[1] +
						" finder2=" + finder_pattern[2]);
				}
			}

			g = grade_finder_patterns(finder_pattern);
			if (g < 1) {
				return [version, 0];
			} else {
				grades.push(g);
			}

			var version_topright = [0, 0];
			var version_bottomleft = [0, 0];
			if (version >= 7) {
				version_topright = matchVersionTopright(qr, n_modules, module_size);
				version_bottomleft = matchVersionBottomleft(qr, n_modules, module_size);

				if (qr.debug_findModuleSize) {
					if (qr.logger) {
						qr.logger.debug("matchVersion version=" + version +
						" version topright = " + version_topright[0] + " " +  version_topright[1] +
						" version bottomleft = " + version_bottomleft[0] + " " +  version_bottomleft[1]);
					}
				}

				var v1 = version;
				if (version_topright[1] < version_bottomleft[1]) {
					if (version_topright[1] < 4) { v1 = version_topright[0]; }
				} else {
					if (version_bottomleft[1] < 4) { v1 = version_bottomleft[0]; }
				}

				if (Math.abs(v1-version) > 2) {
					if (qr.debug_findModuleSize) {
						if (qr.logger) {
							qr.logger.debug("matchVersion: format info " + v1 + " is very different from original version info " + version);
						}
					}
				}
				if (v1 !== version) {
					if (qr.debug_findModuleSize) {
						if (qr.logger) {
							qr.logger.debug("matchVersion: revising version to " + v1 + " from " + version);
						}
					}
					version = v1;
				}
				n_modules = qr.nModulesFromVersion(version);
				module_size = qr.image_size/n_modules;

				g = Math.round( ( (4-version_topright[1]) + (4-version_bottomleft[1]) ) / 2 );
				if (g < 1) {
					return [version, 0];
				} else {
					grades.push(g);
				}
			}

			var timing_pattern = [0, 0];
			timing_pattern[0] = matchTimingPattern(qr, true,  n_modules, module_size);
			timing_pattern[1] = matchTimingPattern(qr, false, n_modules, module_size);

			g = grade_timing_patterns(timing_pattern, n_modules-8-8);
			if (g < 1) {
				return [version, 0];
			} else {
				grades.push(g);
			}

			var alignment_patterns = -3;
			if (version> 1 ) {
				alignment_patterns = matchAlignmentPatterns(qr, version, module_size);
			}

			if (qr.debug_findModuleSize) {
				if (qr.logger) {
					var fraction_alignment_patterns = 1;
					if (version > 1) {
						fraction_alignment_patterns = alignment_patterns/
							(qr.alignment_patterns[version].length*qr.alignment_patterns[version].length-3);
					}
					qr.logger.debug("matchVersion version=" + version +
					" timing0=" + (timing_pattern[0]/(n_modules-8-8)) +
					" timing1=" + (timing_pattern[1]/(n_modules-8-8)) +
					" alignment=" + fraction_alignment_patterns);

				}
			}

			g = grade_alignment_patterns(alignment_patterns, qr.alignment_patterns[version].length*qr.alignment_patterns[version].length-3);
			if (g < 1) {
				return [version, 0];
			} else {
				grades.push(g);
			}

			var format_NW = matchFormatNW(qr, n_modules, module_size);
			var format_NESW = matchFormatNESW(qr, n_modules, module_size);

			var format = 0;
			if (format_NW[1] < format_NESW[1]) {
				format = format_NW[0];
			} else {
				format = format_NESW[0];
			}

			var error_correction_level = Math.floor(format / 8);
			var mask = format % 8;

			if (qr.debug_findModuleSize) {
				if (qr.logger) {
					qr.logger.debug("matchVersion version=" + version +
					" format_NW =" + format_NW[0] + " " +  format_NW[1] +
					" format_NESW =" + format_NESW[0] + " " +  format_NESW[1] +
					" format = " + format +
					" ecl = " + error_correction_level +
					" mask = " + mask);
				}
			}

			g = Math.round( ( (4-format_NW[1]) + (4-format_NESW[1]) ) / 2 );
			if (g < 1) {
				return [version, 0];
			} else {
				grades.push(g);
			}

			var grade = 4;
			var i;
			for (i = 0; i < grades.length; i++) {
				if (grades[i] < grade) { grade = grades[i]; }
			}

			if (qr.debug_findModuleSize) {
				if (qr.logger) {
					var s = "";
					for (i = 0; i < grades.length; i++) { s = s + grades[i]; }
					s = s + "->" + "<b>" + grade + "</b>";
					qr.logger.debug("matchVersion version=" + "<b>" + version + "</b>" + " grades(F(V)TAF): " + s);
				}
			}
			return [version, grade, error_correction_level, mask];
		}


		/* **************************************************
		 * findModuleSize 
		 */

		var best_match_so_far = [0, 0];
		var version;
		for (version = 1; version <= this.max_version; version++) {
			var match = matchVersion(this, version);
			if (match[1] > best_match_so_far[1]) { best_match_so_far = match; }
			if (match[1] === 4) { break; }
		}

		this.version = best_match_so_far[0];
		this.n_modules = this.nModulesFromVersion(this.version);
		this.module_size = this.image_size/this.n_modules;
		this.functional_grade = best_match_so_far[1];
		this.error_correction_level = best_match_so_far[2];
		this.mask = best_match_so_far[3];

		if (this.logger) {
			this.logger.debug(
				"findModuleSize<b>" +
				" version=" + this.version +
				" grade=" + this.functional_grade +
				" error_correction_level=" + this.error_correction_level +
				" mask=" + this.mask+
				"</b>");
		}

		if (this.functional_grade<1) {
			throw ("Unable to decode a function pattern");
		}
	},


	/* ************************************************************ */
	extractCodewords: function () {

		function getUnmasked(qr, j, i) {

			var m;
			switch (qr.mask) {
				case 0:
					m = (i + j) % 2;
					break;
				case 1:
					m = i % 2;
					break;
				case 2:
					m = j % 3;
					break;
				case 3:
					m = (i + j) % 3;
					break;
				case 4:
					m = (Math.floor(i / 2) + Math.floor(j / 3)) % 2;
					break;
				case 5:
					m = (i * j) % 2 + (i * j) % 3;
					break;
				case 6:
					m = ((i * j) % 2 + (i * j) % 3) % 2;
					break;
				case 7:
					m = ((i+j) % 2 + (i * j) % 3) % 2;
					break;
			}

			var u;
			if (m === 0) {
				u = !qr.isDark(j, i);
			} else {
				u = qr.isDark(j, i);
			}
			if (qr.debug_insane) {
				if (qr.logger) {
					qr.logger.debug("getUnmasked i=" + i + " j=" + j + " m=" + m + " u=" + u);
				}
			}
			return u;
		}

		/* ************************************************************ */
		/* extractCodewords
		*/

			/*	Original Java version by Sean Owen
				Copyright 2007 ZXing authors
			*/

		this.codewords = [];
		var readingUp = true;
		var currentByte = 0;
		var factor = 128;
		var bitsRead = 0;
		var i, j, col, count;
		// Read columns in pairs, from right to left
		for (j = this.n_modules - 1; j > 0; j -= 2) {
			if (j === 6) {
				// Skip whole column with vertical alignment pattern;
				// saves time and makes the other code proceed more cleanly
				j--;
			}
			// Read alternatingly from bottom to top then top to bottom
			for (count = 0; count < this.n_modules; count++) {
				i = readingUp ? this.n_modules - 1 - count : count;
				for (col = 0; col < 2; col++) {
					// Ignore bits covered by the function pattern
					if (!this.functional_pattern[j - col][i]) {
						// Read a bit
						if (getUnmasked(this, j - col, i)) {
							currentByte += factor;
						}
						factor /= 2;
						// If we've made a whole byte, save it off
						if (factor < 1) {
							//if (this.logger) this.logger.debug("getUnmasked byte[" + this.codewords.length + "]=" + currentByte);
							this.codewords.push(currentByte);
							bitsRead = 0;
							factor = 128 ;
							currentByte = 0;
						}
					}
				}
			}
			readingUp ^= true; // readingUp = !readingUp; // switch directions
		}

		if (this.debug_extractCodewords) {
			if (this.logger) {
				this.logger.debug("getCodewords mask=" + this.mask + " length=" + this.codewords.length);
				this.logger.debug("getCodewords = " + this.codewords.join(","));
			}
		}

	},


	/* ************************************************************ */
	extractData: function () {

		var n_bits;

		function extract(qr, bytes, pos, len) {
			// http://stackoverflow.com/questions/3846711/extract-bit-sequences-of-arbitrary-length-from-byte-array-efficiently
			var shift = 24 - (pos & 7) - len;
			var mask = (1 << len) - 1;
			var byteIndex = pos >>> 3;

			return ((	(bytes[byteIndex] << 16) | 
					(bytes[++byteIndex]  <<  8) |
					bytes[++byteIndex]
				) >> shift) & mask;
		}

		/* ************************************************************ */
		function extract8bit(qr, bytes) {

			var n_count_bits = qr.nCountBits(qr.MODE.EightBit, qr.version);

			var n = extract(qr, bytes, qr.bit_idx, n_count_bits);
			qr.bit_idx += n_count_bits;

			if (qr.debug_extractData) {
				if (qr.logger) {
					qr.logger.debug("extract charcount = " + n);
				}
			}

			var data = "";
			var i;
			for (i = 0; i < n; i++) {
				data += String.fromCharCode(extract(qr, bytes, qr.bit_idx, 8));
				qr.bit_idx += 8;
			}
			return data;
		}

		/* ************************************************************ */
		function extractAlphanum(qr, bytes) {
			var n_count_bits = qr.nCountBits(qr.MODE.AlphaNumeric, qr.version);
			var n = extract(qr, bytes, qr.bit_idx, n_count_bits);
			qr.bit_idx += n_count_bits;

			if (qr.debug_extractData) {
				if (qr.logger) {
					qr.logger.debug("extractAlphanum charcount = " + n);
				}
			}

			var data = "";
			var i;
			for (i = 0; i < Math.floor(n/2); i++) {
				var x = extract(qr, bytes, qr.bit_idx, 11);
				data += qr.alphanum[Math.floor(x/45)];
				data += qr.alphanum[x%45];
				qr.bit_idx += 11;
			}
			if (n%2) {
				data += qr.alphanum[extract(qr, bytes, qr.bit_idx, 6)];
				qr.bit_idx += 6;
			}
			return data;
		}


		/* ************************************************************ */
		function extractNumeric(qr, bytes) {
			var n_count_bits = qr.nCountBits(qr.MODE.Numeric, qr.version);
			var n = extract(qr, bytes, qr.bit_idx, n_count_bits);
			qr.bit_idx += n_count_bits;

			if (qr.debug_extractData) {
				if (qr.logger) {
					qr.logger.debug("extractNumeric charcount = " + n);
				}
			}

			var data = "";
			var x, c1, c2, c3;
			var i;
			for (i = 0; i < Math.floor(n/3); i++) {
				x = extract(qr, bytes, qr.bit_idx, 10);
				qr.bit_idx += 10;
				c1 = Math.floor(x/100);
				c2 = Math.floor((x%100)/10);
				c3 = x%10;
				data += String.fromCharCode(48+c1, 48+c2, 48+c3);
			}

			if (n%3 === 1) {
				x = extract(qr, bytes, qr.bit_idx, 4);
				qr.bit_idx += 4;
				data += String.fromCharCode(48+x);
			} else if (n%3 === 2) {
				x = extract(qr, bytes, qr.bit_idx, 7);
				qr.bit_idx += 7;
				c1 = Math.floor(x/10);
				c2 = x%10;
				data += String.fromCharCode(48+c1, 48+c2);
			}
			return data;
		}

		/* **************************************************
		 * extractData 
		 */

		var bytes = this.bytes;
		n_bits = bytes.length*8;

		if (this.debug_extractData) {
			if (this.logger) {
				this.logger.debug("extractData bytes in (" + bytes.length + ") = " + bytes.join(","));
			}
		}

		var i;
		for (i = 0; i < 4; i++) { bytes.push(0); }

		this.data = "";
		this.bit_idx = 0;

		while (this.bit_idx < n_bits-4) {
			var mode = extract(this, bytes, this.bit_idx, 4);
			this.bit_idx += 4;
			if (this.debug_extractData) {
				if (this.logger) {
					this.logger.debug("extractData mode = " + mode);
				}
			}

			if (mode === this.MODE.Terminator) { break; }
			else if (mode === this.MODE.AlphaNumeric) { this.data += extractAlphanum(this, bytes); }
			else if (mode === this.MODE.EightBit) { this.data += extract8bit(this, bytes); }
			else if (mode === this.MODE.Numeric) { this.data += extractNumeric(this, bytes); }
			else { throw ("Unsupported ECI mode: " + mode); }
		}	

		if (this.debug_extractData) {
			if (this.logger) {
				var b = [];
				for (i = 0; i < this.data.length; i++) {
					b.push(this.data[i].charCodeAt());
				}
				this.logger.debug("extractData data(" + b.length + ") = " + b.join(","));
			}
		}

	},

	/* ************************************************************ */
	correctErrors: function () {

		var rs = new ReedSolomon(this.n_block_ec_words);
		if (this.debug_correctErrors) { rs.logger = this.logger; }

		var errors = [];
		var bytes = [];
		var error_grade = 4;

		var b;
		for (b = 0; b < this.block_indices.length; b++) {
			var bytes_in = [];
			var i;
			for (i = 0; i < this.block_indices[b].length; i++) {
				bytes_in.push(this.codewords[this.block_indices[b][i]]);
			}
			var bytes_out = rs.decode(bytes_in);
			if (this.debug_correctErrors) {
				if (this.logger) {
					this.logger.debug("correctErrors in  = " + bytes_in.join(","));
					this.logger.debug("correctErrors out = " + bytes_out.join(","));
				}
			}
			if (!rs.corrected) {
				this.error_grade = 0;
				throw("Unable to correct errors (" + rs.uncorrected_reason + ")");
			}
			bytes = bytes.concat(bytes_out);
			errors.push(rs.n_errors);
			}
		this.errors = errors;
		this.bytes = bytes;
		this.error_grade = this.gradeErrors(errors);
		if (this.logger) {
			this.logger.debug("error_grade=" + error_grade);
		}

	},


	/* ************************************************************ */
	gradeErrors: function (errors) {
		var ecw = this.n_block_ec_words;

		var max = 0;
		var i;
		for (i = 0; i < errors.length; i++) {
			if (errors[i] > max) { max = errors[i]; }
		}

		var grade = 4;
		if (max > ecw/2-1) { grade = 0; }
		else if (max>ecw/2-2) { grade = 1; }
		else if (max>ecw/2-3) { grade = 2; }
		else if (max>ecw/2-4) { grade = 3; }

		return grade;
	},


	/* ************************************************************
	 * QRCodeDecode INTERNAL ENCODING / DECODING HELPER FUNCTIONS
	 * ************************************************************
	 */

	getDataCapacity: function (version, error_correction_level, mode) {

		var n_codewords = this.n_codewords[version];
		var n_ec_codewords = this.n_ec_codewords[version][error_correction_level];
		var n_data_codewords = n_codewords - n_ec_codewords;

		var bits = 8*n_data_codewords;
		bits -= 4;	// mode
		bits -= this.nCountBits(mode, version);

		var cap = 0;
		if (mode === this.MODE.AlphaNumeric) {
			cap = Math.floor(bits/11)*2;
			if (bits >= (cap/2)*11+6) { cap++; }
		} else if (mode === this.MODE.EightBit) {
			cap = Math.floor(bits/8);
		} else if (mode === this.MODE.Numeric) {
			cap = Math.floor(bits/10)*3;
			if (bits >= (cap/3)*10+4) {
				if (bits >= (cap/3)*10+7) { cap++; }
				cap++;
			}
		} else {
			throw ("Unsupported ECI mode: " + mode);
		}
		return cap;

	},


	/* ************************************************************ */
	getVersionFromLength: function (error_correction_level, mode, length) {
		var v;
		for (v = 1; v <= 40; v++) {
			if (this.getDataCapacity(v, error_correction_level, mode) >= length) {
				return v;
			}
		}
		throw("Text is too long, even for a version 40 QR Code");
	},


	/* ************************************************************ */
	setBlocks: function () {

		var n_codewords = this.n_codewords[this.version];
		var n_ec_codewords = this.n_ec_codewords[this.version][this.error_correction_level];
		this.n_data_codewords = n_codewords - n_ec_codewords;
		var ec_blocks = this.ec_blocks[this.version][this.error_correction_level];

		var n_blocks;
		var n_blocks_first;
		var n_blocks_second;
		var n_block_words_first;
		var n_block_words_second;

		var i, b;

		if (ec_blocks.length === 1) {
			n_blocks_first = ec_blocks[0];
			n_blocks_second = 0;
			n_blocks = n_blocks_first;
			n_block_words_first = this.n_data_codewords / n_blocks ;
			n_block_words_second = 0 ;
		} else {
			n_blocks_first = ec_blocks[0];
			n_blocks_second = ec_blocks[1];
			n_blocks = n_blocks_first + n_blocks_second;
			n_block_words_first = Math.floor( this.n_data_codewords / n_blocks ) ;
			n_block_words_second = n_block_words_first + 1 ;
		}

		this.n_block_ec_words = n_ec_codewords / n_blocks;

		if (this.debug_setBlocks) {
			if (this.logger) {
				this.logger.debug("setBlocks" +
					" n_blocks_first=" + n_blocks_first +
					" n_blocks_second=" + n_blocks_second +
					" n_blocks=" + n_blocks +
					" n_block_words_first=" + n_block_words_first +
					" n_block_words_second=" + n_block_words_second +
					" n_block_ec_words=" + this.n_block_ec_words +
					" total=" + (n_blocks_first*n_block_words_first+n_blocks_second*n_block_words_second+n_blocks*this.n_block_ec_words));
			}
		}

		this.block_data_lengths = [];
		for (b = 0; b < n_blocks_first; b++) {
			this.block_data_lengths[b] = n_block_words_first;
		}
		for (b = n_blocks_first; b < n_blocks; b++) {
			this.block_data_lengths[b] = n_block_words_second;
		}

		this.block_indices = [];
		for (b = 0; b < n_blocks; b++) {
			this.block_indices[b]=[];
		}

		var w = 0;

		for (i = 0; i < n_block_words_first; i++) {
			for (b = 0; b < n_blocks; b++) {
				this.block_indices[b].push(w);
				w++;
			}
		}

		for (b = n_blocks_first; b < n_blocks; b++) {
			this.block_indices[b].push(w);
			w++;
		}

		for (i = 0; i < this.n_block_ec_words; i++) {
			for (b = 0; b < n_blocks; b++) {
				this.block_indices[b].push(w);
				w++;
			}
		}

		if (this.debug_setBlocks) {
			if (this.logger) {
				for (b = 0; b < n_blocks; b++) {
					this.logger.debug("setBlocks block " + b + " (" +  this.block_indices[b].length + "): " + this.block_indices[b].join(","));
				}
			}
		}
	},


	/* ************************************************************ */
	setFunctionalPattern: function () {

		function markSquare(qr, x, y, w, h) {
			var i, j;
			for (i = x; i < x+w; i++) {
				for (j = y; j < y+h; j++) {
					qr.functional_pattern[i][j] = true;
				}
			}
		}

		/* ************************************************************ */
		function markAlignment(qr) {
			var n = qr.alignment_patterns[qr.version].length;
			var i, j;
			for (i = 0; i < n; i++) {
				for (j = 0; j < n; j++) {
					if ( ((i===0)&&(j===0)) || ((i===0)&&(j===n-1)) || ((i===n-1)&&(j===0)) ) { continue; }

					markSquare(qr, 
						qr.alignment_patterns[qr.version][i]-2,
						qr.alignment_patterns[qr.version][j]-2,
						5, 5);
				}
			}
		}


		/* **************************************************
		 * setFunctionalPattern
		 */

		this.functional_pattern = [];
		var x, y;
		for (x = 0; x < this.n_modules; x++) {
			this.functional_pattern[x] = [];
			for (y = 0; y < this.n_modules; y++) {
				this.functional_pattern[x][y] = false;
			}
		}

		// Finder and Format
		markSquare(this, 0, 0, 9, 9);
		markSquare(this, this.n_modules-8, 0, 8, 9);
		markSquare(this, 0, this.n_modules-8, 9, 8);

		// Timing
		markSquare(this, 8, 6, this.n_modules-8-8, 1);
		markSquare(this, 6, 8, 1, this.n_modules-8-8);

		// Alignment
		markAlignment(this);

		// Version
		if (this.version >= 7) {
			markSquare(this, 0, this.n_modules-11, 6, 3);
			markSquare(this, this.n_modules-11, 0, 3, 6);
		}

		if (this.debug_insane) {
			if (this.logger) {
				for (y = 0; y < this.n_modules; y++) {
					var s = "";
					for (x = 0; x < this.n_modules; x++) {
						s += this.functional_pattern[x][y] ? "X" : "O";
					}
				this.logger.debug(s);		
				}
			}
		}
	},


	/* ************************************************************ */
	nCountBits: function (mode, version) {
		if (mode === this.MODE.EightBit) {
			if (version < 10) { return 8; }
			else { return 16; }
		} else if (mode === this.MODE.AlphaNumeric) {
			if (version < 10) { return 9; }
			else if (version < 27) { return 11; }
			else { return 13; }
		} else if (mode === this.MODE.Numeric) {
			if (version < 10) { return 10; }
			else if (version < 27) { return 12; }
			else { return 14; }
		}
		throw ("Internal error: Unknown mode: " + mode);
	},


	/* ************************************************************ */
	nModulesFromVersion: function (version) {
		return 17+4*version;
	},


	/* ************************************************************ */
	hammingDistance: function (a, b) {

		function nBits(n) {
			var c;   
			for (c = 0; n; c++) {
				n &= n - 1; // clear the least significant bit set
			}
			return c;
		}
		var d = a ^ b;
		return nBits(d);
	},


	/* ************************************************************
	 * QRCodeDecode IMAGE FUNCTIONS
	 * ************************************************************
	 */

	isDarkWithSize: function (x, y, module_size) {
		return this.image.isDark(Math.round(this.image_left + x*module_size), Math.round(this.image_top + y*module_size), Math.round(module_size));
	},


	/* ************************************************************ */
	isDark: function (x, y) {
		return this.isDarkWithSize(x, y, this.module_size);

	},


	/* ************************************************************ */
	setDark: function (x, y) {
		this.image.setDark(this.image_left + x*this.module_size, this.image_top + y*this.module_size, this.module_size);

	},


	/* ************************************************************
	 * QRCodeDecode CONSTANTS
	 * ************************************************************
	 */

	alignment_patterns: [
		null,
		[],
		[6, 18],
		[6, 22],
		[6, 26],
		[6, 30],
		[6, 34],
		[6, 22, 38],
		[6, 24, 42],
		[6, 26, 46],
		[6, 28, 50],
		[6, 30, 54],
		[6, 32, 58],
		[6, 34, 62],
		[6, 26, 46, 66],
		[6, 26, 48, 70],
		[6, 26, 50, 74],
		[6, 30, 54, 78],
		[6, 30, 56, 82],
		[6, 30, 58, 86],
		[6, 34, 62, 90],
		[6, 28, 50, 72, 94],
		[6, 26, 50, 74, 98],
		[6, 30, 54, 78, 102],
		[6, 28, 54, 80, 106],
		[6, 32, 58, 84, 110],
		[6, 30, 58, 86, 114],
		[6, 34, 62, 90, 118],
		[6, 26, 50, 74, 98, 122],
		[6, 30, 54, 78, 102, 126],
		[6, 26, 52, 78, 104, 130],
		[6, 30, 56, 82, 108, 134],
		[6, 34, 60, 86, 112, 138],
		[6, 30, 58, 86, 114, 142],
		[6, 34, 62, 90, 118, 146],
		[6, 30, 54, 78, 102, 126, 150],
		[6, 24, 50, 76, 102, 128, 154],
		[6, 28, 54, 80, 106, 132, 158],
		[6, 32, 58, 84, 110, 136, 162],
		[6, 26, 54, 82, 110, 138, 166],
		[6, 30, 58, 86, 114, 142, 170]
	],


	/* ************************************************************ */
	version_info: [
		null,
		null,
		null,
		null,
		null,
		null,
		null,
		0x07C94,
		0x085BC,
		0x09A99,
		0x0A4D3,
		0x0BBF6,
		0x0C762,
		0x0D847,
		0x0E60D,
		0x0F928,
		0x10B78,
		0x1145D,
		0x12A17,
		0x13532,
		0x149A6,
		0x15683,
		0x168C9,
		0x177EC,
		0x18EC4,
		0x191E1,
		0x1AFAB,
		0x1B08E,
		0x1CC1A,
		0x1D33F,
		0x1ED75,
		0x1F250,
		0x209D5,
		0x216F0,
		0x228BA,
		0x2379F,
		0x24B0B,
		0x2542E,
		0x26A64,
		0x27541,
		0x28C69
	],


	/* ************************************************************ */
	format_info: [
		0x5412,
		0x5125,
		0x5E7C,
		0x5B4B,
		0x45F9,
		0x40CE,
		0x4F97,
		0x4AA0,
		0x77C4,
		0x72F3,
		0x7DAA,
		0x789D,
		0x662F,
		0x6318,
		0x6C41,
		0x6976,
		0x1689,
		0x13BE,
		0x1CE7,
		0x19D0,
		0x0762,
		0x0255,
		0x0D0C,
		0x083B,
		0x355F,
		0x3068,
		0x3F31,
		0x3A06,
		0x24B4,
		0x2183,
		0x2EDA,
		0x2BED
	],


	/* ************************************************************ */
	n_codewords: [
		0,
		26,
		44,
		70,
		100,
		134,
		172,
		196,
		242,
		292,
		346,
		404,
		466,
		532,
		581,
		655,
		733,
		815,
		901,
		991,
		1085,
		1156,
		1258,
		1364,
		1474,
		1588,
		1706,
		1828,
		1921,
		2051,
		2185,
		2323,
		2465,
		2611,
		2761,
		2876,
		3034,
		3196,
		3362,
		3532,
		3706
	],


	/* ************************************************************ */
	n_ec_codewords: [
		null,
		[10, 7, 17, 13],
		[16, 10, 28, 22],
		[26, 15, 44, 36],
		[36, 20, 64, 52],
		[48, 26, 88, 72],
		[64, 36, 112, 96],
		[72, 40, 130, 108],
		[88, 48, 156, 132],
		[110, 60, 192, 160],
		[130, 72, 224, 192],
		[150, 80, 264, 224],
		[176, 96, 308, 260],
		[198, 104, 352, 288],
		[216, 120, 384, 320],
		[240, 132, 432, 360],
		[280, 144, 480, 408],
		[308, 168, 532, 448],
		[338, 180, 588, 504],
		[364, 196, 650, 546],
		[416, 224, 700, 600],
		[442, 224, 750, 644],
		[476, 252, 816, 690],
		[504, 270, 900, 750],
		[560, 300, 960, 810],
		[588, 312, 1050, 870],
		[644, 336, 1110, 952],
		[700, 360, 1200, 1020],
		[728, 390, 1260, 1050],
		[784, 420, 1350, 1140],
		[812, 450, 1440, 1200],
		[868, 480, 1530, 1290],
		[924, 510, 1620, 1350],
		[980, 540, 1710, 1440],
		[1036, 570, 1800, 1530],
		[1064, 570, 1890, 1590],
		[1120, 600, 1980, 1680],
		[1204, 630, 2100, 1770],
		[1260, 660, 2220, 1860],
		[1316, 720, 2310, 1950],
		[1372, 750, 2430, 2040]
	],


	/* ************************************************************ */
	ec_blocks: [
		[],
		[[1], [1], [1], [1]],
		[[1], [1], [1], [1]],
		[[1], [1], [2], [2]],
		[[2], [1], [4], [2]],
		[[2], [1], [2, 2], [2, 2]],
		[[4], [2], [4], [4]],
		[[4], [2], [4, 1], [2, 4]],
		[[2, 2], [2], [4, 2], [4, 2]],
		[[3, 2], [2], [4, 4], [4, 4]],
		[[4, 1], [2, 2], [6, 2], [6, 2]],
		[[1, 4], [4], [3, 8], [4, 4]],
		[[6, 2], [2, 2], [7, 4], [4, 6]],
		[[8, 1], [4], [12, 4], [8, 4]],
		[[4, 5], [3, 1], [11, 5], [11, 5]],
		[[5, 5], [5, 1], [11, 7], [5, 7]],
		[[7, 3], [5, 1], [3, 13], [15, 2]],
		[[10, 1], [1, 5], [2, 17], [1, 15]],
		[[9, 4], [5, 1], [2, 19], [17, 1]],
		[[3, 11], [3, 4], [9, 16], [17, 4]],
		[[3, 13], [3, 5], [15, 10], [15, 5]],
		[[17], [4, 4], [19, 6], [17, 6]],
		[[17], [2, 7], [34], [7, 16]],
		[[4, 14], [4, 5], [16, 14], [11, 14]],
		[[6, 14], [6, 4], [30, 2], [11, 16]],
		[[8, 13], [8, 4], [22, 13], [7, 22]],
		[[19, 4], [10, 2], [33, 4], [28, 6]],
		[[22, 3], [8, 4], [12, 28], [8, 26]],
		[[3, 23], [3, 10], [11, 31], [4, 31]],
		[[21, 7], [7, 7], [19, 26], [1, 37]],
		[[19, 10], [5, 10], [23, 25], [15, 25]],
		[[2, 29], [13, 3], [23, 28], [42, 1]],
		[[10, 23], [17], [19, 35], [10, 35]],
		[[14, 21], [17, 1], [11, 46], [29, 19]],
		[[14, 23], [13, 6], [59, 1], [44, 7]],
		[[12, 26], [12, 7], [22, 41], [39, 14]],
		[[6, 34], [6, 14], [2, 64], [46, 10]],
		[[29, 14], [17, 4], [24, 46], [49, 10]],
		[[13, 32], [4, 18], [42, 32], [48, 14]],
		[[40, 7], [20, 4], [10, 67], [43, 22]],
		[[18, 31], [19, 6], [20, 61], [34, 34]]
	],


	/* ************************************************************ */
	n_remainder_bits: [
		null,
		0,
		7,
		7,
		7,
		7,
		7,
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		3,
		3,
		3,
		3,
		3,
		3,
		3,
		4,
		4,
		4,
		4,
		4,
		4,
		4,
		3,
		3,
		3,
		3,
		3,
		3,
		3,
		0,
		0,
		0,
		0,
		0,
		0
	],

	/* ************************************************************ */
	alphanum: [
		'0',
		'1',
		'2',
		'3',
		'4',
		'5',
		'6',
		'7',
		'8',
		'9',
		'A',
		'B',
		'C',
		'D',
		'E',
		'F',
		'G',
		'H',
		'I',
		'J',
		'K',
		'L',
		'M',
		'N',
		'O',
		'P',
		'Q',
		'R',
		'S',
		'T',
		'U',
		'V',
		'W',
		'X',
		'Y',
		'Z',
		' ',
		'$',
		'%',
		'*',
		'+',
		'-',
		'.',
		'/',
		':'
	],


	/* ************************************************************ */
	alphanum_rev: {
		'0':  0,
		'1':  1,
		'2':  2,
		'3':  3,
		'4':  4,
		'5':  5,
		'6':  6,
		'7':  7,
		'8':  8,
		'9':  9,
		'A': 10,
		'B': 11,
		'C': 12,
		'D': 13,
		'E': 14,
		'F': 15,
		'G': 16,
		'H': 17,
		'I': 18,
		'J': 19,
		'K': 20,
		'L': 21,
		'M': 22,
		'N': 23,
		'O': 24,
		'P': 25,
		'Q': 26,
		'R': 27,
		'S': 28,
		'T': 29,
		'U': 30,
		'V': 31,
		'W': 32,
		'X': 33,
		'Y': 34,
		'Z': 35,
		' ': 36,
		'$': 37,
		'%': 38,
		'*': 39,
		'+': 40,
		'-': 41,
		'.': 42,
		'/': 43,
		':': 44
	}

};
