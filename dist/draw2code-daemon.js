#!/usr/bin/env node
import { createRequire as __d2cCreateRequire } from "node:module"; const require = __d2cCreateRequire(import.meta.url);
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __commonJS = (cb, mod) => function __require2() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps = (to, from2, except, desc) => {
  if (from2 && typeof from2 === "object" || typeof from2 === "function") {
    for (let key of __getOwnPropNames(from2))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from2[key], enumerable: !(desc = __getOwnPropDesc(from2, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/ws/lib/constants.js
var require_constants = __commonJS({
  "node_modules/ws/lib/constants.js"(exports, module) {
    "use strict";
    var BINARY_TYPES = ["nodebuffer", "arraybuffer", "fragments"];
    var hasBlob = typeof Blob !== "undefined";
    if (hasBlob) BINARY_TYPES.push("blob");
    module.exports = {
      BINARY_TYPES,
      EMPTY_BUFFER: Buffer.alloc(0),
      GUID: "258EAFA5-E914-47DA-95CA-C5AB0DC85B11",
      hasBlob,
      kForOnEventAttribute: Symbol("kIsForOnEventAttribute"),
      kListener: Symbol("kListener"),
      kStatusCode: Symbol("status-code"),
      kWebSocket: Symbol("websocket"),
      NOOP: () => {
      }
    };
  }
});

// node_modules/ws/lib/buffer-util.js
var require_buffer_util = __commonJS({
  "node_modules/ws/lib/buffer-util.js"(exports, module) {
    "use strict";
    var { EMPTY_BUFFER } = require_constants();
    var FastBuffer = Buffer[Symbol.species];
    function concat(list, totalLength) {
      if (list.length === 0) return EMPTY_BUFFER;
      if (list.length === 1) return list[0];
      const target = Buffer.allocUnsafe(totalLength);
      let offset = 0;
      for (let i = 0; i < list.length; i++) {
        const buf = list[i];
        target.set(buf, offset);
        offset += buf.length;
      }
      if (offset < totalLength) {
        return new FastBuffer(target.buffer, target.byteOffset, offset);
      }
      return target;
    }
    function _mask(source, mask, output, offset, length) {
      for (let i = 0; i < length; i++) {
        output[offset + i] = source[i] ^ mask[i & 3];
      }
    }
    function _unmask(buffer, mask) {
      for (let i = 0; i < buffer.length; i++) {
        buffer[i] ^= mask[i & 3];
      }
    }
    function toArrayBuffer(buf) {
      if (buf.length === buf.buffer.byteLength) {
        return buf.buffer;
      }
      return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length);
    }
    function toBuffer(data) {
      toBuffer.readOnly = true;
      if (Buffer.isBuffer(data)) return data;
      let buf;
      if (data instanceof ArrayBuffer) {
        buf = new FastBuffer(data);
      } else if (ArrayBuffer.isView(data)) {
        buf = new FastBuffer(data.buffer, data.byteOffset, data.byteLength);
      } else {
        buf = Buffer.from(data);
        toBuffer.readOnly = false;
      }
      return buf;
    }
    module.exports = {
      concat,
      mask: _mask,
      toArrayBuffer,
      toBuffer,
      unmask: _unmask
    };
    if (!process.env.WS_NO_BUFFER_UTIL) {
      try {
        const bufferUtil = __require("bufferutil");
        module.exports.mask = function(source, mask, output, offset, length) {
          if (length < 48) _mask(source, mask, output, offset, length);
          else bufferUtil.mask(source, mask, output, offset, length);
        };
        module.exports.unmask = function(buffer, mask) {
          if (buffer.length < 32) _unmask(buffer, mask);
          else bufferUtil.unmask(buffer, mask);
        };
      } catch (e) {
      }
    }
  }
});

// node_modules/ws/lib/limiter.js
var require_limiter = __commonJS({
  "node_modules/ws/lib/limiter.js"(exports, module) {
    "use strict";
    var kDone = Symbol("kDone");
    var kRun = Symbol("kRun");
    var Limiter = class {
      /**
       * Creates a new `Limiter`.
       *
       * @param {Number} [concurrency=Infinity] The maximum number of jobs allowed
       *     to run concurrently
       */
      constructor(concurrency) {
        this[kDone] = () => {
          this.pending--;
          this[kRun]();
        };
        this.concurrency = concurrency || Infinity;
        this.jobs = [];
        this.pending = 0;
      }
      /**
       * Adds a job to the queue.
       *
       * @param {Function} job The job to run
       * @public
       */
      add(job) {
        this.jobs.push(job);
        this[kRun]();
      }
      /**
       * Removes a job from the queue and runs it if possible.
       *
       * @private
       */
      [kRun]() {
        if (this.pending === this.concurrency) return;
        if (this.jobs.length) {
          const job = this.jobs.shift();
          this.pending++;
          job(this[kDone]);
        }
      }
    };
    module.exports = Limiter;
  }
});

// node_modules/ws/lib/permessage-deflate.js
var require_permessage_deflate = __commonJS({
  "node_modules/ws/lib/permessage-deflate.js"(exports, module) {
    "use strict";
    var zlib = __require("zlib");
    var bufferUtil = require_buffer_util();
    var Limiter = require_limiter();
    var { kStatusCode } = require_constants();
    var FastBuffer = Buffer[Symbol.species];
    var TRAILER = Buffer.from([0, 0, 255, 255]);
    var kPerMessageDeflate = Symbol("permessage-deflate");
    var kTotalLength = Symbol("total-length");
    var kCallback = Symbol("callback");
    var kBuffers = Symbol("buffers");
    var kError = Symbol("error");
    var zlibLimiter;
    var PerMessageDeflate = class {
      /**
       * Creates a PerMessageDeflate instance.
       *
       * @param {Object} [options] Configuration options
       * @param {(Boolean|Number)} [options.clientMaxWindowBits] Advertise support
       *     for, or request, a custom client window size
       * @param {Boolean} [options.clientNoContextTakeover=false] Advertise/
       *     acknowledge disabling of client context takeover
       * @param {Number} [options.concurrencyLimit=10] The number of concurrent
       *     calls to zlib
       * @param {(Boolean|Number)} [options.serverMaxWindowBits] Request/confirm the
       *     use of a custom server window size
       * @param {Boolean} [options.serverNoContextTakeover=false] Request/accept
       *     disabling of server context takeover
       * @param {Number} [options.threshold=1024] Size (in bytes) below which
       *     messages should not be compressed if context takeover is disabled
       * @param {Object} [options.zlibDeflateOptions] Options to pass to zlib on
       *     deflate
       * @param {Object} [options.zlibInflateOptions] Options to pass to zlib on
       *     inflate
       * @param {Boolean} [isServer=false] Create the instance in either server or
       *     client mode
       * @param {Number} [maxPayload=0] The maximum allowed message length
       */
      constructor(options, isServer, maxPayload) {
        this._maxPayload = maxPayload | 0;
        this._options = options || {};
        this._threshold = this._options.threshold !== void 0 ? this._options.threshold : 1024;
        this._isServer = !!isServer;
        this._deflate = null;
        this._inflate = null;
        this.params = null;
        if (!zlibLimiter) {
          const concurrency = this._options.concurrencyLimit !== void 0 ? this._options.concurrencyLimit : 10;
          zlibLimiter = new Limiter(concurrency);
        }
      }
      /**
       * @type {String}
       */
      static get extensionName() {
        return "permessage-deflate";
      }
      /**
       * Create an extension negotiation offer.
       *
       * @return {Object} Extension parameters
       * @public
       */
      offer() {
        const params = {};
        if (this._options.serverNoContextTakeover) {
          params.server_no_context_takeover = true;
        }
        if (this._options.clientNoContextTakeover) {
          params.client_no_context_takeover = true;
        }
        if (this._options.serverMaxWindowBits) {
          params.server_max_window_bits = this._options.serverMaxWindowBits;
        }
        if (this._options.clientMaxWindowBits) {
          params.client_max_window_bits = this._options.clientMaxWindowBits;
        } else if (this._options.clientMaxWindowBits == null) {
          params.client_max_window_bits = true;
        }
        return params;
      }
      /**
       * Accept an extension negotiation offer/response.
       *
       * @param {Array} configurations The extension negotiation offers/reponse
       * @return {Object} Accepted configuration
       * @public
       */
      accept(configurations) {
        configurations = this.normalizeParams(configurations);
        this.params = this._isServer ? this.acceptAsServer(configurations) : this.acceptAsClient(configurations);
        return this.params;
      }
      /**
       * Releases all resources used by the extension.
       *
       * @public
       */
      cleanup() {
        if (this._inflate) {
          this._inflate.close();
          this._inflate = null;
        }
        if (this._deflate) {
          const callback = this._deflate[kCallback];
          this._deflate.close();
          this._deflate = null;
          if (callback) {
            callback(
              new Error(
                "The deflate stream was closed while data was being processed"
              )
            );
          }
        }
      }
      /**
       *  Accept an extension negotiation offer.
       *
       * @param {Array} offers The extension negotiation offers
       * @return {Object} Accepted configuration
       * @private
       */
      acceptAsServer(offers) {
        const opts = this._options;
        const accepted = offers.find((params) => {
          if (opts.serverNoContextTakeover === false && params.server_no_context_takeover || params.server_max_window_bits && (opts.serverMaxWindowBits === false || typeof opts.serverMaxWindowBits === "number" && opts.serverMaxWindowBits > params.server_max_window_bits) || typeof opts.clientMaxWindowBits === "number" && !params.client_max_window_bits) {
            return false;
          }
          return true;
        });
        if (!accepted) {
          throw new Error("None of the extension offers can be accepted");
        }
        if (opts.serverNoContextTakeover) {
          accepted.server_no_context_takeover = true;
        }
        if (opts.clientNoContextTakeover) {
          accepted.client_no_context_takeover = true;
        }
        if (typeof opts.serverMaxWindowBits === "number") {
          accepted.server_max_window_bits = opts.serverMaxWindowBits;
        }
        if (typeof opts.clientMaxWindowBits === "number") {
          accepted.client_max_window_bits = opts.clientMaxWindowBits;
        } else if (accepted.client_max_window_bits === true || opts.clientMaxWindowBits === false) {
          delete accepted.client_max_window_bits;
        }
        return accepted;
      }
      /**
       * Accept the extension negotiation response.
       *
       * @param {Array} response The extension negotiation response
       * @return {Object} Accepted configuration
       * @private
       */
      acceptAsClient(response) {
        const params = response[0];
        if (this._options.clientNoContextTakeover === false && params.client_no_context_takeover) {
          throw new Error('Unexpected parameter "client_no_context_takeover"');
        }
        if (!params.client_max_window_bits) {
          if (typeof this._options.clientMaxWindowBits === "number") {
            params.client_max_window_bits = this._options.clientMaxWindowBits;
          }
        } else if (this._options.clientMaxWindowBits === false || typeof this._options.clientMaxWindowBits === "number" && params.client_max_window_bits > this._options.clientMaxWindowBits) {
          throw new Error(
            'Unexpected or invalid parameter "client_max_window_bits"'
          );
        }
        return params;
      }
      /**
       * Normalize parameters.
       *
       * @param {Array} configurations The extension negotiation offers/reponse
       * @return {Array} The offers/response with normalized parameters
       * @private
       */
      normalizeParams(configurations) {
        configurations.forEach((params) => {
          Object.keys(params).forEach((key) => {
            let value = params[key];
            if (value.length > 1) {
              throw new Error(`Parameter "${key}" must have only a single value`);
            }
            value = value[0];
            if (key === "client_max_window_bits") {
              if (value !== true) {
                const num4 = +value;
                if (!Number.isInteger(num4) || num4 < 8 || num4 > 15) {
                  throw new TypeError(
                    `Invalid value for parameter "${key}": ${value}`
                  );
                }
                value = num4;
              } else if (!this._isServer) {
                throw new TypeError(
                  `Invalid value for parameter "${key}": ${value}`
                );
              }
            } else if (key === "server_max_window_bits") {
              const num4 = +value;
              if (!Number.isInteger(num4) || num4 < 8 || num4 > 15) {
                throw new TypeError(
                  `Invalid value for parameter "${key}": ${value}`
                );
              }
              value = num4;
            } else if (key === "client_no_context_takeover" || key === "server_no_context_takeover") {
              if (value !== true) {
                throw new TypeError(
                  `Invalid value for parameter "${key}": ${value}`
                );
              }
            } else {
              throw new Error(`Unknown parameter "${key}"`);
            }
            params[key] = value;
          });
        });
        return configurations;
      }
      /**
       * Decompress data. Concurrency limited.
       *
       * @param {Buffer} data Compressed data
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @public
       */
      decompress(data, fin, callback) {
        zlibLimiter.add((done) => {
          this._decompress(data, fin, (err2, result) => {
            done();
            callback(err2, result);
          });
        });
      }
      /**
       * Compress data. Concurrency limited.
       *
       * @param {(Buffer|String)} data Data to compress
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @public
       */
      compress(data, fin, callback) {
        zlibLimiter.add((done) => {
          this._compress(data, fin, (err2, result) => {
            done();
            callback(err2, result);
          });
        });
      }
      /**
       * Decompress data.
       *
       * @param {Buffer} data Compressed data
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @private
       */
      _decompress(data, fin, callback) {
        const endpoint = this._isServer ? "client" : "server";
        if (!this._inflate) {
          const key = `${endpoint}_max_window_bits`;
          const windowBits = typeof this.params[key] !== "number" ? zlib.Z_DEFAULT_WINDOWBITS : this.params[key];
          this._inflate = zlib.createInflateRaw({
            ...this._options.zlibInflateOptions,
            windowBits
          });
          this._inflate[kPerMessageDeflate] = this;
          this._inflate[kTotalLength] = 0;
          this._inflate[kBuffers] = [];
          this._inflate.on("error", inflateOnError);
          this._inflate.on("data", inflateOnData);
        }
        this._inflate[kCallback] = callback;
        this._inflate.write(data);
        if (fin) this._inflate.write(TRAILER);
        this._inflate.flush(() => {
          const err2 = this._inflate[kError];
          if (err2) {
            this._inflate.close();
            this._inflate = null;
            callback(err2);
            return;
          }
          const data2 = bufferUtil.concat(
            this._inflate[kBuffers],
            this._inflate[kTotalLength]
          );
          if (this._inflate._readableState.endEmitted) {
            this._inflate.close();
            this._inflate = null;
          } else {
            this._inflate[kTotalLength] = 0;
            this._inflate[kBuffers] = [];
            if (fin && this.params[`${endpoint}_no_context_takeover`]) {
              this._inflate.reset();
            }
          }
          callback(null, data2);
        });
      }
      /**
       * Compress data.
       *
       * @param {(Buffer|String)} data Data to compress
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @private
       */
      _compress(data, fin, callback) {
        const endpoint = this._isServer ? "server" : "client";
        if (!this._deflate) {
          const key = `${endpoint}_max_window_bits`;
          const windowBits = typeof this.params[key] !== "number" ? zlib.Z_DEFAULT_WINDOWBITS : this.params[key];
          this._deflate = zlib.createDeflateRaw({
            ...this._options.zlibDeflateOptions,
            windowBits
          });
          this._deflate[kTotalLength] = 0;
          this._deflate[kBuffers] = [];
          this._deflate.on("data", deflateOnData);
        }
        this._deflate[kCallback] = callback;
        this._deflate.write(data);
        this._deflate.flush(zlib.Z_SYNC_FLUSH, () => {
          if (!this._deflate) {
            return;
          }
          let data2 = bufferUtil.concat(
            this._deflate[kBuffers],
            this._deflate[kTotalLength]
          );
          if (fin) {
            data2 = new FastBuffer(data2.buffer, data2.byteOffset, data2.length - 4);
          }
          this._deflate[kCallback] = null;
          this._deflate[kTotalLength] = 0;
          this._deflate[kBuffers] = [];
          if (fin && this.params[`${endpoint}_no_context_takeover`]) {
            this._deflate.reset();
          }
          callback(null, data2);
        });
      }
    };
    module.exports = PerMessageDeflate;
    function deflateOnData(chunk) {
      this[kBuffers].push(chunk);
      this[kTotalLength] += chunk.length;
    }
    function inflateOnData(chunk) {
      this[kTotalLength] += chunk.length;
      if (this[kPerMessageDeflate]._maxPayload < 1 || this[kTotalLength] <= this[kPerMessageDeflate]._maxPayload) {
        this[kBuffers].push(chunk);
        return;
      }
      this[kError] = new RangeError("Max payload size exceeded");
      this[kError].code = "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH";
      this[kError][kStatusCode] = 1009;
      this.removeListener("data", inflateOnData);
      this.reset();
    }
    function inflateOnError(err2) {
      this[kPerMessageDeflate]._inflate = null;
      if (this[kError]) {
        this[kCallback](this[kError]);
        return;
      }
      err2[kStatusCode] = 1007;
      this[kCallback](err2);
    }
  }
});

// node_modules/ws/lib/validation.js
var require_validation = __commonJS({
  "node_modules/ws/lib/validation.js"(exports, module) {
    "use strict";
    var { isUtf8 } = __require("buffer");
    var { hasBlob } = require_constants();
    var tokenChars = [
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      // 0 - 15
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      // 16 - 31
      0,
      1,
      0,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      1,
      1,
      0,
      1,
      1,
      0,
      // 32 - 47
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      0,
      0,
      0,
      0,
      // 48 - 63
      0,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      // 64 - 79
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      0,
      1,
      1,
      // 80 - 95
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      // 96 - 111
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      1,
      0,
      1,
      0
      // 112 - 127
    ];
    function isValidStatusCode(code) {
      return code >= 1e3 && code <= 1014 && code !== 1004 && code !== 1005 && code !== 1006 || code >= 3e3 && code <= 4999;
    }
    function _isValidUTF8(buf) {
      const len = buf.length;
      let i = 0;
      while (i < len) {
        if ((buf[i] & 128) === 0) {
          i++;
        } else if ((buf[i] & 224) === 192) {
          if (i + 1 === len || (buf[i + 1] & 192) !== 128 || (buf[i] & 254) === 192) {
            return false;
          }
          i += 2;
        } else if ((buf[i] & 240) === 224) {
          if (i + 2 >= len || (buf[i + 1] & 192) !== 128 || (buf[i + 2] & 192) !== 128 || buf[i] === 224 && (buf[i + 1] & 224) === 128 || // Overlong
          buf[i] === 237 && (buf[i + 1] & 224) === 160) {
            return false;
          }
          i += 3;
        } else if ((buf[i] & 248) === 240) {
          if (i + 3 >= len || (buf[i + 1] & 192) !== 128 || (buf[i + 2] & 192) !== 128 || (buf[i + 3] & 192) !== 128 || buf[i] === 240 && (buf[i + 1] & 240) === 128 || // Overlong
          buf[i] === 244 && buf[i + 1] > 143 || buf[i] > 244) {
            return false;
          }
          i += 4;
        } else {
          return false;
        }
      }
      return true;
    }
    function isBlob(value) {
      return hasBlob && typeof value === "object" && typeof value.arrayBuffer === "function" && typeof value.type === "string" && typeof value.stream === "function" && (value[Symbol.toStringTag] === "Blob" || value[Symbol.toStringTag] === "File");
    }
    module.exports = {
      isBlob,
      isValidStatusCode,
      isValidUTF8: _isValidUTF8,
      tokenChars
    };
    if (isUtf8) {
      module.exports.isValidUTF8 = function(buf) {
        return buf.length < 24 ? _isValidUTF8(buf) : isUtf8(buf);
      };
    } else if (!process.env.WS_NO_UTF_8_VALIDATE) {
      try {
        const isValidUTF8 = __require("utf-8-validate");
        module.exports.isValidUTF8 = function(buf) {
          return buf.length < 32 ? _isValidUTF8(buf) : isValidUTF8(buf);
        };
      } catch (e) {
      }
    }
  }
});

// node_modules/ws/lib/receiver.js
var require_receiver = __commonJS({
  "node_modules/ws/lib/receiver.js"(exports, module) {
    "use strict";
    var { Writable } = __require("stream");
    var PerMessageDeflate = require_permessage_deflate();
    var {
      BINARY_TYPES,
      EMPTY_BUFFER,
      kStatusCode,
      kWebSocket
    } = require_constants();
    var { concat, toArrayBuffer, unmask } = require_buffer_util();
    var { isValidStatusCode, isValidUTF8 } = require_validation();
    var FastBuffer = Buffer[Symbol.species];
    var GET_INFO = 0;
    var GET_PAYLOAD_LENGTH_16 = 1;
    var GET_PAYLOAD_LENGTH_64 = 2;
    var GET_MASK = 3;
    var GET_DATA = 4;
    var INFLATING = 5;
    var DEFER_EVENT = 6;
    var Receiver2 = class extends Writable {
      /**
       * Creates a Receiver instance.
       *
       * @param {Object} [options] Options object
       * @param {Boolean} [options.allowSynchronousEvents=true] Specifies whether
       *     any of the `'message'`, `'ping'`, and `'pong'` events can be emitted
       *     multiple times in the same tick
       * @param {String} [options.binaryType=nodebuffer] The type for binary data
       * @param {Object} [options.extensions] An object containing the negotiated
       *     extensions
       * @param {Boolean} [options.isServer=false] Specifies whether to operate in
       *     client or server mode
       * @param {Number} [options.maxPayload=0] The maximum allowed message length
       * @param {Boolean} [options.skipUTF8Validation=false] Specifies whether or
       *     not to skip UTF-8 validation for text and close messages
       */
      constructor(options = {}) {
        super();
        this._allowSynchronousEvents = options.allowSynchronousEvents !== void 0 ? options.allowSynchronousEvents : true;
        this._binaryType = options.binaryType || BINARY_TYPES[0];
        this._extensions = options.extensions || {};
        this._isServer = !!options.isServer;
        this._maxPayload = options.maxPayload | 0;
        this._skipUTF8Validation = !!options.skipUTF8Validation;
        this[kWebSocket] = void 0;
        this._bufferedBytes = 0;
        this._buffers = [];
        this._compressed = false;
        this._payloadLength = 0;
        this._mask = void 0;
        this._fragmented = 0;
        this._masked = false;
        this._fin = false;
        this._opcode = 0;
        this._totalPayloadLength = 0;
        this._messageLength = 0;
        this._fragments = [];
        this._errored = false;
        this._loop = false;
        this._state = GET_INFO;
      }
      /**
       * Implements `Writable.prototype._write()`.
       *
       * @param {Buffer} chunk The chunk of data to write
       * @param {String} encoding The character encoding of `chunk`
       * @param {Function} cb Callback
       * @private
       */
      _write(chunk, encoding, cb) {
        if (this._opcode === 8 && this._state == GET_INFO) return cb();
        this._bufferedBytes += chunk.length;
        this._buffers.push(chunk);
        this.startLoop(cb);
      }
      /**
       * Consumes `n` bytes from the buffered data.
       *
       * @param {Number} n The number of bytes to consume
       * @return {Buffer} The consumed bytes
       * @private
       */
      consume(n) {
        this._bufferedBytes -= n;
        if (n === this._buffers[0].length) return this._buffers.shift();
        if (n < this._buffers[0].length) {
          const buf = this._buffers[0];
          this._buffers[0] = new FastBuffer(
            buf.buffer,
            buf.byteOffset + n,
            buf.length - n
          );
          return new FastBuffer(buf.buffer, buf.byteOffset, n);
        }
        const dst = Buffer.allocUnsafe(n);
        do {
          const buf = this._buffers[0];
          const offset = dst.length - n;
          if (n >= buf.length) {
            dst.set(this._buffers.shift(), offset);
          } else {
            dst.set(new Uint8Array(buf.buffer, buf.byteOffset, n), offset);
            this._buffers[0] = new FastBuffer(
              buf.buffer,
              buf.byteOffset + n,
              buf.length - n
            );
          }
          n -= buf.length;
        } while (n > 0);
        return dst;
      }
      /**
       * Starts the parsing loop.
       *
       * @param {Function} cb Callback
       * @private
       */
      startLoop(cb) {
        this._loop = true;
        do {
          switch (this._state) {
            case GET_INFO:
              this.getInfo(cb);
              break;
            case GET_PAYLOAD_LENGTH_16:
              this.getPayloadLength16(cb);
              break;
            case GET_PAYLOAD_LENGTH_64:
              this.getPayloadLength64(cb);
              break;
            case GET_MASK:
              this.getMask();
              break;
            case GET_DATA:
              this.getData(cb);
              break;
            case INFLATING:
            case DEFER_EVENT:
              this._loop = false;
              return;
          }
        } while (this._loop);
        if (!this._errored) cb();
      }
      /**
       * Reads the first two bytes of a frame.
       *
       * @param {Function} cb Callback
       * @private
       */
      getInfo(cb) {
        if (this._bufferedBytes < 2) {
          this._loop = false;
          return;
        }
        const buf = this.consume(2);
        if ((buf[0] & 48) !== 0) {
          const error2 = this.createError(
            RangeError,
            "RSV2 and RSV3 must be clear",
            true,
            1002,
            "WS_ERR_UNEXPECTED_RSV_2_3"
          );
          cb(error2);
          return;
        }
        const compressed = (buf[0] & 64) === 64;
        if (compressed && !this._extensions[PerMessageDeflate.extensionName]) {
          const error2 = this.createError(
            RangeError,
            "RSV1 must be clear",
            true,
            1002,
            "WS_ERR_UNEXPECTED_RSV_1"
          );
          cb(error2);
          return;
        }
        this._fin = (buf[0] & 128) === 128;
        this._opcode = buf[0] & 15;
        this._payloadLength = buf[1] & 127;
        if (this._opcode === 0) {
          if (compressed) {
            const error2 = this.createError(
              RangeError,
              "RSV1 must be clear",
              true,
              1002,
              "WS_ERR_UNEXPECTED_RSV_1"
            );
            cb(error2);
            return;
          }
          if (!this._fragmented) {
            const error2 = this.createError(
              RangeError,
              "invalid opcode 0",
              true,
              1002,
              "WS_ERR_INVALID_OPCODE"
            );
            cb(error2);
            return;
          }
          this._opcode = this._fragmented;
        } else if (this._opcode === 1 || this._opcode === 2) {
          if (this._fragmented) {
            const error2 = this.createError(
              RangeError,
              `invalid opcode ${this._opcode}`,
              true,
              1002,
              "WS_ERR_INVALID_OPCODE"
            );
            cb(error2);
            return;
          }
          this._compressed = compressed;
        } else if (this._opcode > 7 && this._opcode < 11) {
          if (!this._fin) {
            const error2 = this.createError(
              RangeError,
              "FIN must be set",
              true,
              1002,
              "WS_ERR_EXPECTED_FIN"
            );
            cb(error2);
            return;
          }
          if (compressed) {
            const error2 = this.createError(
              RangeError,
              "RSV1 must be clear",
              true,
              1002,
              "WS_ERR_UNEXPECTED_RSV_1"
            );
            cb(error2);
            return;
          }
          if (this._payloadLength > 125 || this._opcode === 8 && this._payloadLength === 1) {
            const error2 = this.createError(
              RangeError,
              `invalid payload length ${this._payloadLength}`,
              true,
              1002,
              "WS_ERR_INVALID_CONTROL_PAYLOAD_LENGTH"
            );
            cb(error2);
            return;
          }
        } else {
          const error2 = this.createError(
            RangeError,
            `invalid opcode ${this._opcode}`,
            true,
            1002,
            "WS_ERR_INVALID_OPCODE"
          );
          cb(error2);
          return;
        }
        if (!this._fin && !this._fragmented) this._fragmented = this._opcode;
        this._masked = (buf[1] & 128) === 128;
        if (this._isServer) {
          if (!this._masked) {
            const error2 = this.createError(
              RangeError,
              "MASK must be set",
              true,
              1002,
              "WS_ERR_EXPECTED_MASK"
            );
            cb(error2);
            return;
          }
        } else if (this._masked) {
          const error2 = this.createError(
            RangeError,
            "MASK must be clear",
            true,
            1002,
            "WS_ERR_UNEXPECTED_MASK"
          );
          cb(error2);
          return;
        }
        if (this._payloadLength === 126) this._state = GET_PAYLOAD_LENGTH_16;
        else if (this._payloadLength === 127) this._state = GET_PAYLOAD_LENGTH_64;
        else this.haveLength(cb);
      }
      /**
       * Gets extended payload length (7+16).
       *
       * @param {Function} cb Callback
       * @private
       */
      getPayloadLength16(cb) {
        if (this._bufferedBytes < 2) {
          this._loop = false;
          return;
        }
        this._payloadLength = this.consume(2).readUInt16BE(0);
        this.haveLength(cb);
      }
      /**
       * Gets extended payload length (7+64).
       *
       * @param {Function} cb Callback
       * @private
       */
      getPayloadLength64(cb) {
        if (this._bufferedBytes < 8) {
          this._loop = false;
          return;
        }
        const buf = this.consume(8);
        const num4 = buf.readUInt32BE(0);
        if (num4 > Math.pow(2, 53 - 32) - 1) {
          const error2 = this.createError(
            RangeError,
            "Unsupported WebSocket frame: payload length > 2^53 - 1",
            false,
            1009,
            "WS_ERR_UNSUPPORTED_DATA_PAYLOAD_LENGTH"
          );
          cb(error2);
          return;
        }
        this._payloadLength = num4 * Math.pow(2, 32) + buf.readUInt32BE(4);
        this.haveLength(cb);
      }
      /**
       * Payload length has been read.
       *
       * @param {Function} cb Callback
       * @private
       */
      haveLength(cb) {
        if (this._payloadLength && this._opcode < 8) {
          this._totalPayloadLength += this._payloadLength;
          if (this._totalPayloadLength > this._maxPayload && this._maxPayload > 0) {
            const error2 = this.createError(
              RangeError,
              "Max payload size exceeded",
              false,
              1009,
              "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH"
            );
            cb(error2);
            return;
          }
        }
        if (this._masked) this._state = GET_MASK;
        else this._state = GET_DATA;
      }
      /**
       * Reads mask bytes.
       *
       * @private
       */
      getMask() {
        if (this._bufferedBytes < 4) {
          this._loop = false;
          return;
        }
        this._mask = this.consume(4);
        this._state = GET_DATA;
      }
      /**
       * Reads data bytes.
       *
       * @param {Function} cb Callback
       * @private
       */
      getData(cb) {
        let data = EMPTY_BUFFER;
        if (this._payloadLength) {
          if (this._bufferedBytes < this._payloadLength) {
            this._loop = false;
            return;
          }
          data = this.consume(this._payloadLength);
          if (this._masked && (this._mask[0] | this._mask[1] | this._mask[2] | this._mask[3]) !== 0) {
            unmask(data, this._mask);
          }
        }
        if (this._opcode > 7) {
          this.controlMessage(data, cb);
          return;
        }
        if (this._compressed) {
          this._state = INFLATING;
          this.decompress(data, cb);
          return;
        }
        if (data.length) {
          this._messageLength = this._totalPayloadLength;
          this._fragments.push(data);
        }
        this.dataMessage(cb);
      }
      /**
       * Decompresses data.
       *
       * @param {Buffer} data Compressed data
       * @param {Function} cb Callback
       * @private
       */
      decompress(data, cb) {
        const perMessageDeflate = this._extensions[PerMessageDeflate.extensionName];
        perMessageDeflate.decompress(data, this._fin, (err2, buf) => {
          if (err2) return cb(err2);
          if (buf.length) {
            this._messageLength += buf.length;
            if (this._messageLength > this._maxPayload && this._maxPayload > 0) {
              const error2 = this.createError(
                RangeError,
                "Max payload size exceeded",
                false,
                1009,
                "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH"
              );
              cb(error2);
              return;
            }
            this._fragments.push(buf);
          }
          this.dataMessage(cb);
          if (this._state === GET_INFO) this.startLoop(cb);
        });
      }
      /**
       * Handles a data message.
       *
       * @param {Function} cb Callback
       * @private
       */
      dataMessage(cb) {
        if (!this._fin) {
          this._state = GET_INFO;
          return;
        }
        const messageLength = this._messageLength;
        const fragments = this._fragments;
        this._totalPayloadLength = 0;
        this._messageLength = 0;
        this._fragmented = 0;
        this._fragments = [];
        if (this._opcode === 2) {
          let data;
          if (this._binaryType === "nodebuffer") {
            data = concat(fragments, messageLength);
          } else if (this._binaryType === "arraybuffer") {
            data = toArrayBuffer(concat(fragments, messageLength));
          } else if (this._binaryType === "blob") {
            data = new Blob(fragments);
          } else {
            data = fragments;
          }
          if (this._allowSynchronousEvents) {
            this.emit("message", data, true);
            this._state = GET_INFO;
          } else {
            this._state = DEFER_EVENT;
            setImmediate(() => {
              this.emit("message", data, true);
              this._state = GET_INFO;
              this.startLoop(cb);
            });
          }
        } else {
          const buf = concat(fragments, messageLength);
          if (!this._skipUTF8Validation && !isValidUTF8(buf)) {
            const error2 = this.createError(
              Error,
              "invalid UTF-8 sequence",
              true,
              1007,
              "WS_ERR_INVALID_UTF8"
            );
            cb(error2);
            return;
          }
          if (this._state === INFLATING || this._allowSynchronousEvents) {
            this.emit("message", buf, false);
            this._state = GET_INFO;
          } else {
            this._state = DEFER_EVENT;
            setImmediate(() => {
              this.emit("message", buf, false);
              this._state = GET_INFO;
              this.startLoop(cb);
            });
          }
        }
      }
      /**
       * Handles a control message.
       *
       * @param {Buffer} data Data to handle
       * @return {(Error|RangeError|undefined)} A possible error
       * @private
       */
      controlMessage(data, cb) {
        if (this._opcode === 8) {
          if (data.length === 0) {
            this._loop = false;
            this.emit("conclude", 1005, EMPTY_BUFFER);
            this.end();
          } else {
            const code = data.readUInt16BE(0);
            if (!isValidStatusCode(code)) {
              const error2 = this.createError(
                RangeError,
                `invalid status code ${code}`,
                true,
                1002,
                "WS_ERR_INVALID_CLOSE_CODE"
              );
              cb(error2);
              return;
            }
            const buf = new FastBuffer(
              data.buffer,
              data.byteOffset + 2,
              data.length - 2
            );
            if (!this._skipUTF8Validation && !isValidUTF8(buf)) {
              const error2 = this.createError(
                Error,
                "invalid UTF-8 sequence",
                true,
                1007,
                "WS_ERR_INVALID_UTF8"
              );
              cb(error2);
              return;
            }
            this._loop = false;
            this.emit("conclude", code, buf);
            this.end();
          }
          this._state = GET_INFO;
          return;
        }
        if (this._allowSynchronousEvents) {
          this.emit(this._opcode === 9 ? "ping" : "pong", data);
          this._state = GET_INFO;
        } else {
          this._state = DEFER_EVENT;
          setImmediate(() => {
            this.emit(this._opcode === 9 ? "ping" : "pong", data);
            this._state = GET_INFO;
            this.startLoop(cb);
          });
        }
      }
      /**
       * Builds an error object.
       *
       * @param {function(new:Error|RangeError)} ErrorCtor The error constructor
       * @param {String} message The error message
       * @param {Boolean} prefix Specifies whether or not to add a default prefix to
       *     `message`
       * @param {Number} statusCode The status code
       * @param {String} errorCode The exposed error code
       * @return {(Error|RangeError)} The error
       * @private
       */
      createError(ErrorCtor, message, prefix, statusCode, errorCode2) {
        this._loop = false;
        this._errored = true;
        const err2 = new ErrorCtor(
          prefix ? `Invalid WebSocket frame: ${message}` : message
        );
        Error.captureStackTrace(err2, this.createError);
        err2.code = errorCode2;
        err2[kStatusCode] = statusCode;
        return err2;
      }
    };
    module.exports = Receiver2;
  }
});

// node_modules/ws/lib/sender.js
var require_sender = __commonJS({
  "node_modules/ws/lib/sender.js"(exports, module) {
    "use strict";
    var { Duplex } = __require("stream");
    var { randomFillSync } = __require("crypto");
    var PerMessageDeflate = require_permessage_deflate();
    var { EMPTY_BUFFER, kWebSocket, NOOP } = require_constants();
    var { isBlob, isValidStatusCode } = require_validation();
    var { mask: applyMask, toBuffer } = require_buffer_util();
    var kByteLength = Symbol("kByteLength");
    var maskBuffer = Buffer.alloc(4);
    var RANDOM_POOL_SIZE = 8 * 1024;
    var randomPool;
    var randomPoolPointer = RANDOM_POOL_SIZE;
    var DEFAULT = 0;
    var DEFLATING = 1;
    var GET_BLOB_DATA = 2;
    var Sender2 = class _Sender {
      /**
       * Creates a Sender instance.
       *
       * @param {Duplex} socket The connection socket
       * @param {Object} [extensions] An object containing the negotiated extensions
       * @param {Function} [generateMask] The function used to generate the masking
       *     key
       */
      constructor(socket, extensions, generateMask) {
        this._extensions = extensions || {};
        if (generateMask) {
          this._generateMask = generateMask;
          this._maskBuffer = Buffer.alloc(4);
        }
        this._socket = socket;
        this._firstFragment = true;
        this._compress = false;
        this._bufferedBytes = 0;
        this._queue = [];
        this._state = DEFAULT;
        this.onerror = NOOP;
        this[kWebSocket] = void 0;
      }
      /**
       * Frames a piece of data according to the HyBi WebSocket protocol.
       *
       * @param {(Buffer|String)} data The data to frame
       * @param {Object} options Options object
       * @param {Boolean} [options.fin=false] Specifies whether or not to set the
       *     FIN bit
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Buffer} [options.maskBuffer] The buffer used to store the masking
       *     key
       * @param {Number} options.opcode The opcode
       * @param {Boolean} [options.readOnly=false] Specifies whether `data` can be
       *     modified
       * @param {Boolean} [options.rsv1=false] Specifies whether or not to set the
       *     RSV1 bit
       * @return {(Buffer|String)[]} The framed data
       * @public
       */
      static frame(data, options) {
        let mask;
        let merge2 = false;
        let offset = 2;
        let skipMasking = false;
        if (options.mask) {
          mask = options.maskBuffer || maskBuffer;
          if (options.generateMask) {
            options.generateMask(mask);
          } else {
            if (randomPoolPointer === RANDOM_POOL_SIZE) {
              if (randomPool === void 0) {
                randomPool = Buffer.alloc(RANDOM_POOL_SIZE);
              }
              randomFillSync(randomPool, 0, RANDOM_POOL_SIZE);
              randomPoolPointer = 0;
            }
            mask[0] = randomPool[randomPoolPointer++];
            mask[1] = randomPool[randomPoolPointer++];
            mask[2] = randomPool[randomPoolPointer++];
            mask[3] = randomPool[randomPoolPointer++];
          }
          skipMasking = (mask[0] | mask[1] | mask[2] | mask[3]) === 0;
          offset = 6;
        }
        let dataLength;
        if (typeof data === "string") {
          if ((!options.mask || skipMasking) && options[kByteLength] !== void 0) {
            dataLength = options[kByteLength];
          } else {
            data = Buffer.from(data);
            dataLength = data.length;
          }
        } else {
          dataLength = data.length;
          merge2 = options.mask && options.readOnly && !skipMasking;
        }
        let payloadLength = dataLength;
        if (dataLength >= 65536) {
          offset += 8;
          payloadLength = 127;
        } else if (dataLength > 125) {
          offset += 2;
          payloadLength = 126;
        }
        const target = Buffer.allocUnsafe(merge2 ? dataLength + offset : offset);
        target[0] = options.fin ? options.opcode | 128 : options.opcode;
        if (options.rsv1) target[0] |= 64;
        target[1] = payloadLength;
        if (payloadLength === 126) {
          target.writeUInt16BE(dataLength, 2);
        } else if (payloadLength === 127) {
          target[2] = target[3] = 0;
          target.writeUIntBE(dataLength, 4, 6);
        }
        if (!options.mask) return [target, data];
        target[1] |= 128;
        target[offset - 4] = mask[0];
        target[offset - 3] = mask[1];
        target[offset - 2] = mask[2];
        target[offset - 1] = mask[3];
        if (skipMasking) return [target, data];
        if (merge2) {
          applyMask(data, mask, target, offset, dataLength);
          return [target];
        }
        applyMask(data, mask, data, 0, dataLength);
        return [target, data];
      }
      /**
       * Sends a close message to the other peer.
       *
       * @param {Number} [code] The status code component of the body
       * @param {(String|Buffer)} [data] The message component of the body
       * @param {Boolean} [mask=false] Specifies whether or not to mask the message
       * @param {Function} [cb] Callback
       * @public
       */
      close(code, data, mask, cb) {
        let buf;
        if (code === void 0) {
          buf = EMPTY_BUFFER;
        } else if (typeof code !== "number" || !isValidStatusCode(code)) {
          throw new TypeError("First argument must be a valid error code number");
        } else if (data === void 0 || !data.length) {
          buf = Buffer.allocUnsafe(2);
          buf.writeUInt16BE(code, 0);
        } else {
          const length = Buffer.byteLength(data);
          if (length > 123) {
            throw new RangeError("The message must not be greater than 123 bytes");
          }
          buf = Buffer.allocUnsafe(2 + length);
          buf.writeUInt16BE(code, 0);
          if (typeof data === "string") {
            buf.write(data, 2);
          } else {
            buf.set(data, 2);
          }
        }
        const options = {
          [kByteLength]: buf.length,
          fin: true,
          generateMask: this._generateMask,
          mask,
          maskBuffer: this._maskBuffer,
          opcode: 8,
          readOnly: false,
          rsv1: false
        };
        if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, buf, false, options, cb]);
        } else {
          this.sendFrame(_Sender.frame(buf, options), cb);
        }
      }
      /**
       * Sends a ping message to the other peer.
       *
       * @param {*} data The message to send
       * @param {Boolean} [mask=false] Specifies whether or not to mask `data`
       * @param {Function} [cb] Callback
       * @public
       */
      ping(data, mask, cb) {
        let byteLength;
        let readOnly;
        if (typeof data === "string") {
          byteLength = Buffer.byteLength(data);
          readOnly = false;
        } else if (isBlob(data)) {
          byteLength = data.size;
          readOnly = false;
        } else {
          data = toBuffer(data);
          byteLength = data.length;
          readOnly = toBuffer.readOnly;
        }
        if (byteLength > 125) {
          throw new RangeError("The data size must not be greater than 125 bytes");
        }
        const options = {
          [kByteLength]: byteLength,
          fin: true,
          generateMask: this._generateMask,
          mask,
          maskBuffer: this._maskBuffer,
          opcode: 9,
          readOnly,
          rsv1: false
        };
        if (isBlob(data)) {
          if (this._state !== DEFAULT) {
            this.enqueue([this.getBlobData, data, false, options, cb]);
          } else {
            this.getBlobData(data, false, options, cb);
          }
        } else if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, data, false, options, cb]);
        } else {
          this.sendFrame(_Sender.frame(data, options), cb);
        }
      }
      /**
       * Sends a pong message to the other peer.
       *
       * @param {*} data The message to send
       * @param {Boolean} [mask=false] Specifies whether or not to mask `data`
       * @param {Function} [cb] Callback
       * @public
       */
      pong(data, mask, cb) {
        let byteLength;
        let readOnly;
        if (typeof data === "string") {
          byteLength = Buffer.byteLength(data);
          readOnly = false;
        } else if (isBlob(data)) {
          byteLength = data.size;
          readOnly = false;
        } else {
          data = toBuffer(data);
          byteLength = data.length;
          readOnly = toBuffer.readOnly;
        }
        if (byteLength > 125) {
          throw new RangeError("The data size must not be greater than 125 bytes");
        }
        const options = {
          [kByteLength]: byteLength,
          fin: true,
          generateMask: this._generateMask,
          mask,
          maskBuffer: this._maskBuffer,
          opcode: 10,
          readOnly,
          rsv1: false
        };
        if (isBlob(data)) {
          if (this._state !== DEFAULT) {
            this.enqueue([this.getBlobData, data, false, options, cb]);
          } else {
            this.getBlobData(data, false, options, cb);
          }
        } else if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, data, false, options, cb]);
        } else {
          this.sendFrame(_Sender.frame(data, options), cb);
        }
      }
      /**
       * Sends a data message to the other peer.
       *
       * @param {*} data The message to send
       * @param {Object} options Options object
       * @param {Boolean} [options.binary=false] Specifies whether `data` is binary
       *     or text
       * @param {Boolean} [options.compress=false] Specifies whether or not to
       *     compress `data`
       * @param {Boolean} [options.fin=false] Specifies whether the fragment is the
       *     last one
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Function} [cb] Callback
       * @public
       */
      send(data, options, cb) {
        const perMessageDeflate = this._extensions[PerMessageDeflate.extensionName];
        let opcode = options.binary ? 2 : 1;
        let rsv1 = options.compress;
        let byteLength;
        let readOnly;
        if (typeof data === "string") {
          byteLength = Buffer.byteLength(data);
          readOnly = false;
        } else if (isBlob(data)) {
          byteLength = data.size;
          readOnly = false;
        } else {
          data = toBuffer(data);
          byteLength = data.length;
          readOnly = toBuffer.readOnly;
        }
        if (this._firstFragment) {
          this._firstFragment = false;
          if (rsv1 && perMessageDeflate && perMessageDeflate.params[perMessageDeflate._isServer ? "server_no_context_takeover" : "client_no_context_takeover"]) {
            rsv1 = byteLength >= perMessageDeflate._threshold;
          }
          this._compress = rsv1;
        } else {
          rsv1 = false;
          opcode = 0;
        }
        if (options.fin) this._firstFragment = true;
        const opts = {
          [kByteLength]: byteLength,
          fin: options.fin,
          generateMask: this._generateMask,
          mask: options.mask,
          maskBuffer: this._maskBuffer,
          opcode,
          readOnly,
          rsv1
        };
        if (isBlob(data)) {
          if (this._state !== DEFAULT) {
            this.enqueue([this.getBlobData, data, this._compress, opts, cb]);
          } else {
            this.getBlobData(data, this._compress, opts, cb);
          }
        } else if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, data, this._compress, opts, cb]);
        } else {
          this.dispatch(data, this._compress, opts, cb);
        }
      }
      /**
       * Gets the contents of a blob as binary data.
       *
       * @param {Blob} blob The blob
       * @param {Boolean} [compress=false] Specifies whether or not to compress
       *     the data
       * @param {Object} options Options object
       * @param {Boolean} [options.fin=false] Specifies whether or not to set the
       *     FIN bit
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Buffer} [options.maskBuffer] The buffer used to store the masking
       *     key
       * @param {Number} options.opcode The opcode
       * @param {Boolean} [options.readOnly=false] Specifies whether `data` can be
       *     modified
       * @param {Boolean} [options.rsv1=false] Specifies whether or not to set the
       *     RSV1 bit
       * @param {Function} [cb] Callback
       * @private
       */
      getBlobData(blob, compress, options, cb) {
        this._bufferedBytes += options[kByteLength];
        this._state = GET_BLOB_DATA;
        blob.arrayBuffer().then((arrayBuffer2) => {
          if (this._socket.destroyed) {
            const err2 = new Error(
              "The socket was closed while the blob was being read"
            );
            process.nextTick(callCallbacks, this, err2, cb);
            return;
          }
          this._bufferedBytes -= options[kByteLength];
          const data = toBuffer(arrayBuffer2);
          if (!compress) {
            this._state = DEFAULT;
            this.sendFrame(_Sender.frame(data, options), cb);
            this.dequeue();
          } else {
            this.dispatch(data, compress, options, cb);
          }
        }).catch((err2) => {
          process.nextTick(onError, this, err2, cb);
        });
      }
      /**
       * Dispatches a message.
       *
       * @param {(Buffer|String)} data The message to send
       * @param {Boolean} [compress=false] Specifies whether or not to compress
       *     `data`
       * @param {Object} options Options object
       * @param {Boolean} [options.fin=false] Specifies whether or not to set the
       *     FIN bit
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Buffer} [options.maskBuffer] The buffer used to store the masking
       *     key
       * @param {Number} options.opcode The opcode
       * @param {Boolean} [options.readOnly=false] Specifies whether `data` can be
       *     modified
       * @param {Boolean} [options.rsv1=false] Specifies whether or not to set the
       *     RSV1 bit
       * @param {Function} [cb] Callback
       * @private
       */
      dispatch(data, compress, options, cb) {
        if (!compress) {
          this.sendFrame(_Sender.frame(data, options), cb);
          return;
        }
        const perMessageDeflate = this._extensions[PerMessageDeflate.extensionName];
        this._bufferedBytes += options[kByteLength];
        this._state = DEFLATING;
        perMessageDeflate.compress(data, options.fin, (_, buf) => {
          if (this._socket.destroyed) {
            const err2 = new Error(
              "The socket was closed while data was being compressed"
            );
            callCallbacks(this, err2, cb);
            return;
          }
          this._bufferedBytes -= options[kByteLength];
          this._state = DEFAULT;
          options.readOnly = false;
          this.sendFrame(_Sender.frame(buf, options), cb);
          this.dequeue();
        });
      }
      /**
       * Executes queued send operations.
       *
       * @private
       */
      dequeue() {
        while (this._state === DEFAULT && this._queue.length) {
          const params = this._queue.shift();
          this._bufferedBytes -= params[3][kByteLength];
          Reflect.apply(params[0], this, params.slice(1));
        }
      }
      /**
       * Enqueues a send operation.
       *
       * @param {Array} params Send operation parameters.
       * @private
       */
      enqueue(params) {
        this._bufferedBytes += params[3][kByteLength];
        this._queue.push(params);
      }
      /**
       * Sends a frame.
       *
       * @param {(Buffer | String)[]} list The frame to send
       * @param {Function} [cb] Callback
       * @private
       */
      sendFrame(list, cb) {
        if (list.length === 2) {
          this._socket.cork();
          this._socket.write(list[0]);
          this._socket.write(list[1], cb);
          this._socket.uncork();
        } else {
          this._socket.write(list[0], cb);
        }
      }
    };
    module.exports = Sender2;
    function callCallbacks(sender, err2, cb) {
      if (typeof cb === "function") cb(err2);
      for (let i = 0; i < sender._queue.length; i++) {
        const params = sender._queue[i];
        const callback = params[params.length - 1];
        if (typeof callback === "function") callback(err2);
      }
    }
    function onError(sender, err2, cb) {
      callCallbacks(sender, err2, cb);
      sender.onerror(err2);
    }
  }
});

// node_modules/ws/lib/event-target.js
var require_event_target = __commonJS({
  "node_modules/ws/lib/event-target.js"(exports, module) {
    "use strict";
    var { kForOnEventAttribute, kListener } = require_constants();
    var kCode = Symbol("kCode");
    var kData = Symbol("kData");
    var kError = Symbol("kError");
    var kMessage = Symbol("kMessage");
    var kReason = Symbol("kReason");
    var kTarget = Symbol("kTarget");
    var kType = Symbol("kType");
    var kWasClean = Symbol("kWasClean");
    var Event = class {
      /**
       * Create a new `Event`.
       *
       * @param {String} type The name of the event
       * @throws {TypeError} If the `type` argument is not specified
       */
      constructor(type) {
        this[kTarget] = null;
        this[kType] = type;
      }
      /**
       * @type {*}
       */
      get target() {
        return this[kTarget];
      }
      /**
       * @type {String}
       */
      get type() {
        return this[kType];
      }
    };
    Object.defineProperty(Event.prototype, "target", { enumerable: true });
    Object.defineProperty(Event.prototype, "type", { enumerable: true });
    var CloseEvent = class extends Event {
      /**
       * Create a new `CloseEvent`.
       *
       * @param {String} type The name of the event
       * @param {Object} [options] A dictionary object that allows for setting
       *     attributes via object members of the same name
       * @param {Number} [options.code=0] The status code explaining why the
       *     connection was closed
       * @param {String} [options.reason=''] A human-readable string explaining why
       *     the connection was closed
       * @param {Boolean} [options.wasClean=false] Indicates whether or not the
       *     connection was cleanly closed
       */
      constructor(type, options = {}) {
        super(type);
        this[kCode] = options.code === void 0 ? 0 : options.code;
        this[kReason] = options.reason === void 0 ? "" : options.reason;
        this[kWasClean] = options.wasClean === void 0 ? false : options.wasClean;
      }
      /**
       * @type {Number}
       */
      get code() {
        return this[kCode];
      }
      /**
       * @type {String}
       */
      get reason() {
        return this[kReason];
      }
      /**
       * @type {Boolean}
       */
      get wasClean() {
        return this[kWasClean];
      }
    };
    Object.defineProperty(CloseEvent.prototype, "code", { enumerable: true });
    Object.defineProperty(CloseEvent.prototype, "reason", { enumerable: true });
    Object.defineProperty(CloseEvent.prototype, "wasClean", { enumerable: true });
    var ErrorEvent = class extends Event {
      /**
       * Create a new `ErrorEvent`.
       *
       * @param {String} type The name of the event
       * @param {Object} [options] A dictionary object that allows for setting
       *     attributes via object members of the same name
       * @param {*} [options.error=null] The error that generated this event
       * @param {String} [options.message=''] The error message
       */
      constructor(type, options = {}) {
        super(type);
        this[kError] = options.error === void 0 ? null : options.error;
        this[kMessage] = options.message === void 0 ? "" : options.message;
      }
      /**
       * @type {*}
       */
      get error() {
        return this[kError];
      }
      /**
       * @type {String}
       */
      get message() {
        return this[kMessage];
      }
    };
    Object.defineProperty(ErrorEvent.prototype, "error", { enumerable: true });
    Object.defineProperty(ErrorEvent.prototype, "message", { enumerable: true });
    var MessageEvent = class extends Event {
      /**
       * Create a new `MessageEvent`.
       *
       * @param {String} type The name of the event
       * @param {Object} [options] A dictionary object that allows for setting
       *     attributes via object members of the same name
       * @param {*} [options.data=null] The message content
       */
      constructor(type, options = {}) {
        super(type);
        this[kData] = options.data === void 0 ? null : options.data;
      }
      /**
       * @type {*}
       */
      get data() {
        return this[kData];
      }
    };
    Object.defineProperty(MessageEvent.prototype, "data", { enumerable: true });
    var EventTarget = {
      /**
       * Register an event listener.
       *
       * @param {String} type A string representing the event type to listen for
       * @param {(Function|Object)} handler The listener to add
       * @param {Object} [options] An options object specifies characteristics about
       *     the event listener
       * @param {Boolean} [options.once=false] A `Boolean` indicating that the
       *     listener should be invoked at most once after being added. If `true`,
       *     the listener would be automatically removed when invoked.
       * @public
       */
      addEventListener(type, handler, options = {}) {
        for (const listener of this.listeners(type)) {
          if (!options[kForOnEventAttribute] && listener[kListener] === handler && !listener[kForOnEventAttribute]) {
            return;
          }
        }
        let wrapper;
        if (type === "message") {
          wrapper = function onMessage(data, isBinary) {
            const event = new MessageEvent("message", {
              data: isBinary ? data : data.toString()
            });
            event[kTarget] = this;
            callListener(handler, this, event);
          };
        } else if (type === "close") {
          wrapper = function onClose(code, message) {
            const event = new CloseEvent("close", {
              code,
              reason: message.toString(),
              wasClean: this._closeFrameReceived && this._closeFrameSent
            });
            event[kTarget] = this;
            callListener(handler, this, event);
          };
        } else if (type === "error") {
          wrapper = function onError(error2) {
            const event = new ErrorEvent("error", {
              error: error2,
              message: error2.message
            });
            event[kTarget] = this;
            callListener(handler, this, event);
          };
        } else if (type === "open") {
          wrapper = function onOpen() {
            const event = new Event("open");
            event[kTarget] = this;
            callListener(handler, this, event);
          };
        } else {
          return;
        }
        wrapper[kForOnEventAttribute] = !!options[kForOnEventAttribute];
        wrapper[kListener] = handler;
        if (options.once) {
          this.once(type, wrapper);
        } else {
          this.on(type, wrapper);
        }
      },
      /**
       * Remove an event listener.
       *
       * @param {String} type A string representing the event type to remove
       * @param {(Function|Object)} handler The listener to remove
       * @public
       */
      removeEventListener(type, handler) {
        for (const listener of this.listeners(type)) {
          if (listener[kListener] === handler && !listener[kForOnEventAttribute]) {
            this.removeListener(type, listener);
            break;
          }
        }
      }
    };
    module.exports = {
      CloseEvent,
      ErrorEvent,
      Event,
      EventTarget,
      MessageEvent
    };
    function callListener(listener, thisArg, event) {
      if (typeof listener === "object" && listener.handleEvent) {
        listener.handleEvent.call(listener, event);
      } else {
        listener.call(thisArg, event);
      }
    }
  }
});

// node_modules/ws/lib/extension.js
var require_extension = __commonJS({
  "node_modules/ws/lib/extension.js"(exports, module) {
    "use strict";
    var { tokenChars } = require_validation();
    function push2(dest, name, elem) {
      if (dest[name] === void 0) dest[name] = [elem];
      else dest[name].push(elem);
    }
    function parse(header) {
      const offers = /* @__PURE__ */ Object.create(null);
      let params = /* @__PURE__ */ Object.create(null);
      let mustUnescape = false;
      let isEscaping = false;
      let inQuotes = false;
      let extensionName;
      let paramName;
      let start = -1;
      let code = -1;
      let end = -1;
      let i = 0;
      for (; i < header.length; i++) {
        code = header.charCodeAt(i);
        if (extensionName === void 0) {
          if (end === -1 && tokenChars[code] === 1) {
            if (start === -1) start = i;
          } else if (i !== 0 && (code === 32 || code === 9)) {
            if (end === -1 && start !== -1) end = i;
          } else if (code === 59 || code === 44) {
            if (start === -1) {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
            if (end === -1) end = i;
            const name = header.slice(start, end);
            if (code === 44) {
              push2(offers, name, params);
              params = /* @__PURE__ */ Object.create(null);
            } else {
              extensionName = name;
            }
            start = end = -1;
          } else {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
        } else if (paramName === void 0) {
          if (end === -1 && tokenChars[code] === 1) {
            if (start === -1) start = i;
          } else if (code === 32 || code === 9) {
            if (end === -1 && start !== -1) end = i;
          } else if (code === 59 || code === 44) {
            if (start === -1) {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
            if (end === -1) end = i;
            push2(params, header.slice(start, end), true);
            if (code === 44) {
              push2(offers, extensionName, params);
              params = /* @__PURE__ */ Object.create(null);
              extensionName = void 0;
            }
            start = end = -1;
          } else if (code === 61 && start !== -1 && end === -1) {
            paramName = header.slice(start, i);
            start = end = -1;
          } else {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
        } else {
          if (isEscaping) {
            if (tokenChars[code] !== 1) {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
            if (start === -1) start = i;
            else if (!mustUnescape) mustUnescape = true;
            isEscaping = false;
          } else if (inQuotes) {
            if (tokenChars[code] === 1) {
              if (start === -1) start = i;
            } else if (code === 34 && start !== -1) {
              inQuotes = false;
              end = i;
            } else if (code === 92) {
              isEscaping = true;
            } else {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
          } else if (code === 34 && header.charCodeAt(i - 1) === 61) {
            inQuotes = true;
          } else if (end === -1 && tokenChars[code] === 1) {
            if (start === -1) start = i;
          } else if (start !== -1 && (code === 32 || code === 9)) {
            if (end === -1) end = i;
          } else if (code === 59 || code === 44) {
            if (start === -1) {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
            if (end === -1) end = i;
            let value = header.slice(start, end);
            if (mustUnescape) {
              value = value.replace(/\\/g, "");
              mustUnescape = false;
            }
            push2(params, paramName, value);
            if (code === 44) {
              push2(offers, extensionName, params);
              params = /* @__PURE__ */ Object.create(null);
              extensionName = void 0;
            }
            paramName = void 0;
            start = end = -1;
          } else {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
        }
      }
      if (start === -1 || inQuotes || code === 32 || code === 9) {
        throw new SyntaxError("Unexpected end of input");
      }
      if (end === -1) end = i;
      const token = header.slice(start, end);
      if (extensionName === void 0) {
        push2(offers, token, params);
      } else {
        if (paramName === void 0) {
          push2(params, token, true);
        } else if (mustUnescape) {
          push2(params, paramName, token.replace(/\\/g, ""));
        } else {
          push2(params, paramName, token);
        }
        push2(offers, extensionName, params);
      }
      return offers;
    }
    function format(extensions) {
      return Object.keys(extensions).map((extension) => {
        let configurations = extensions[extension];
        if (!Array.isArray(configurations)) configurations = [configurations];
        return configurations.map((params) => {
          return [extension].concat(
            Object.keys(params).map((k) => {
              let values = params[k];
              if (!Array.isArray(values)) values = [values];
              return values.map((v) => v === true ? k : `${k}=${v}`).join("; ");
            })
          ).join("; ");
        }).join(", ");
      }).join(", ");
    }
    module.exports = { format, parse };
  }
});

// node_modules/ws/lib/websocket.js
var require_websocket = __commonJS({
  "node_modules/ws/lib/websocket.js"(exports, module) {
    "use strict";
    var EventEmitter = __require("events");
    var https = __require("https");
    var http = __require("http");
    var net = __require("net");
    var tls = __require("tls");
    var { randomBytes: randomBytes3, createHash: createHash3 } = __require("crypto");
    var { Duplex, Readable } = __require("stream");
    var { URL: URL3 } = __require("url");
    var PerMessageDeflate = require_permessage_deflate();
    var Receiver2 = require_receiver();
    var Sender2 = require_sender();
    var { isBlob } = require_validation();
    var {
      BINARY_TYPES,
      EMPTY_BUFFER,
      GUID,
      kForOnEventAttribute,
      kListener,
      kStatusCode,
      kWebSocket,
      NOOP
    } = require_constants();
    var {
      EventTarget: { addEventListener, removeEventListener }
    } = require_event_target();
    var { format, parse } = require_extension();
    var { toBuffer } = require_buffer_util();
    var closeTimeout = 30 * 1e3;
    var kAborted = Symbol("kAborted");
    var protocolVersions = [8, 13];
    var readyStates = ["CONNECTING", "OPEN", "CLOSING", "CLOSED"];
    var subprotocolRegex = /^[!#$%&'*+\-.0-9A-Z^_`|a-z~]+$/;
    var WebSocket2 = class _WebSocket extends EventEmitter {
      /**
       * Create a new `WebSocket`.
       *
       * @param {(String|URL)} address The URL to which to connect
       * @param {(String|String[])} [protocols] The subprotocols
       * @param {Object} [options] Connection options
       */
      constructor(address, protocols, options) {
        super();
        this._binaryType = BINARY_TYPES[0];
        this._closeCode = 1006;
        this._closeFrameReceived = false;
        this._closeFrameSent = false;
        this._closeMessage = EMPTY_BUFFER;
        this._closeTimer = null;
        this._errorEmitted = false;
        this._extensions = {};
        this._paused = false;
        this._protocol = "";
        this._readyState = _WebSocket.CONNECTING;
        this._receiver = null;
        this._sender = null;
        this._socket = null;
        if (address !== null) {
          this._bufferedAmount = 0;
          this._isServer = false;
          this._redirects = 0;
          if (protocols === void 0) {
            protocols = [];
          } else if (!Array.isArray(protocols)) {
            if (typeof protocols === "object" && protocols !== null) {
              options = protocols;
              protocols = [];
            } else {
              protocols = [protocols];
            }
          }
          initAsClient(this, address, protocols, options);
        } else {
          this._autoPong = options.autoPong;
          this._isServer = true;
        }
      }
      /**
       * For historical reasons, the custom "nodebuffer" type is used by the default
       * instead of "blob".
       *
       * @type {String}
       */
      get binaryType() {
        return this._binaryType;
      }
      set binaryType(type) {
        if (!BINARY_TYPES.includes(type)) return;
        this._binaryType = type;
        if (this._receiver) this._receiver._binaryType = type;
      }
      /**
       * @type {Number}
       */
      get bufferedAmount() {
        if (!this._socket) return this._bufferedAmount;
        return this._socket._writableState.length + this._sender._bufferedBytes;
      }
      /**
       * @type {String}
       */
      get extensions() {
        return Object.keys(this._extensions).join();
      }
      /**
       * @type {Boolean}
       */
      get isPaused() {
        return this._paused;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onclose() {
        return null;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onerror() {
        return null;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onopen() {
        return null;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onmessage() {
        return null;
      }
      /**
       * @type {String}
       */
      get protocol() {
        return this._protocol;
      }
      /**
       * @type {Number}
       */
      get readyState() {
        return this._readyState;
      }
      /**
       * @type {String}
       */
      get url() {
        return this._url;
      }
      /**
       * Set up the socket and the internal resources.
       *
       * @param {Duplex} socket The network socket between the server and client
       * @param {Buffer} head The first packet of the upgraded stream
       * @param {Object} options Options object
       * @param {Boolean} [options.allowSynchronousEvents=false] Specifies whether
       *     any of the `'message'`, `'ping'`, and `'pong'` events can be emitted
       *     multiple times in the same tick
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Number} [options.maxPayload=0] The maximum allowed message size
       * @param {Boolean} [options.skipUTF8Validation=false] Specifies whether or
       *     not to skip UTF-8 validation for text and close messages
       * @private
       */
      setSocket(socket, head, options) {
        const receiver = new Receiver2({
          allowSynchronousEvents: options.allowSynchronousEvents,
          binaryType: this.binaryType,
          extensions: this._extensions,
          isServer: this._isServer,
          maxPayload: options.maxPayload,
          skipUTF8Validation: options.skipUTF8Validation
        });
        const sender = new Sender2(socket, this._extensions, options.generateMask);
        this._receiver = receiver;
        this._sender = sender;
        this._socket = socket;
        receiver[kWebSocket] = this;
        sender[kWebSocket] = this;
        socket[kWebSocket] = this;
        receiver.on("conclude", receiverOnConclude);
        receiver.on("drain", receiverOnDrain);
        receiver.on("error", receiverOnError);
        receiver.on("message", receiverOnMessage);
        receiver.on("ping", receiverOnPing);
        receiver.on("pong", receiverOnPong);
        sender.onerror = senderOnError;
        if (socket.setTimeout) socket.setTimeout(0);
        if (socket.setNoDelay) socket.setNoDelay();
        if (head.length > 0) socket.unshift(head);
        socket.on("close", socketOnClose);
        socket.on("data", socketOnData);
        socket.on("end", socketOnEnd);
        socket.on("error", socketOnError);
        this._readyState = _WebSocket.OPEN;
        this.emit("open");
      }
      /**
       * Emit the `'close'` event.
       *
       * @private
       */
      emitClose() {
        if (!this._socket) {
          this._readyState = _WebSocket.CLOSED;
          this.emit("close", this._closeCode, this._closeMessage);
          return;
        }
        if (this._extensions[PerMessageDeflate.extensionName]) {
          this._extensions[PerMessageDeflate.extensionName].cleanup();
        }
        this._receiver.removeAllListeners();
        this._readyState = _WebSocket.CLOSED;
        this.emit("close", this._closeCode, this._closeMessage);
      }
      /**
       * Start a closing handshake.
       *
       *          +----------+   +-----------+   +----------+
       *     - - -|ws.close()|-->|close frame|-->|ws.close()|- - -
       *    |     +----------+   +-----------+   +----------+     |
       *          +----------+   +-----------+         |
       * CLOSING  |ws.close()|<--|close frame|<--+-----+       CLOSING
       *          +----------+   +-----------+   |
       *    |           |                        |   +---+        |
       *                +------------------------+-->|fin| - - - -
       *    |         +---+                      |   +---+
       *     - - - - -|fin|<---------------------+
       *              +---+
       *
       * @param {Number} [code] Status code explaining why the connection is closing
       * @param {(String|Buffer)} [data] The reason why the connection is
       *     closing
       * @public
       */
      close(code, data) {
        if (this.readyState === _WebSocket.CLOSED) return;
        if (this.readyState === _WebSocket.CONNECTING) {
          const msg = "WebSocket was closed before the connection was established";
          abortHandshake(this, this._req, msg);
          return;
        }
        if (this.readyState === _WebSocket.CLOSING) {
          if (this._closeFrameSent && (this._closeFrameReceived || this._receiver._writableState.errorEmitted)) {
            this._socket.end();
          }
          return;
        }
        this._readyState = _WebSocket.CLOSING;
        this._sender.close(code, data, !this._isServer, (err2) => {
          if (err2) return;
          this._closeFrameSent = true;
          if (this._closeFrameReceived || this._receiver._writableState.errorEmitted) {
            this._socket.end();
          }
        });
        setCloseTimer(this);
      }
      /**
       * Pause the socket.
       *
       * @public
       */
      pause() {
        if (this.readyState === _WebSocket.CONNECTING || this.readyState === _WebSocket.CLOSED) {
          return;
        }
        this._paused = true;
        this._socket.pause();
      }
      /**
       * Send a ping.
       *
       * @param {*} [data] The data to send
       * @param {Boolean} [mask] Indicates whether or not to mask `data`
       * @param {Function} [cb] Callback which is executed when the ping is sent
       * @public
       */
      ping(data, mask, cb) {
        if (this.readyState === _WebSocket.CONNECTING) {
          throw new Error("WebSocket is not open: readyState 0 (CONNECTING)");
        }
        if (typeof data === "function") {
          cb = data;
          data = mask = void 0;
        } else if (typeof mask === "function") {
          cb = mask;
          mask = void 0;
        }
        if (typeof data === "number") data = data.toString();
        if (this.readyState !== _WebSocket.OPEN) {
          sendAfterClose(this, data, cb);
          return;
        }
        if (mask === void 0) mask = !this._isServer;
        this._sender.ping(data || EMPTY_BUFFER, mask, cb);
      }
      /**
       * Send a pong.
       *
       * @param {*} [data] The data to send
       * @param {Boolean} [mask] Indicates whether or not to mask `data`
       * @param {Function} [cb] Callback which is executed when the pong is sent
       * @public
       */
      pong(data, mask, cb) {
        if (this.readyState === _WebSocket.CONNECTING) {
          throw new Error("WebSocket is not open: readyState 0 (CONNECTING)");
        }
        if (typeof data === "function") {
          cb = data;
          data = mask = void 0;
        } else if (typeof mask === "function") {
          cb = mask;
          mask = void 0;
        }
        if (typeof data === "number") data = data.toString();
        if (this.readyState !== _WebSocket.OPEN) {
          sendAfterClose(this, data, cb);
          return;
        }
        if (mask === void 0) mask = !this._isServer;
        this._sender.pong(data || EMPTY_BUFFER, mask, cb);
      }
      /**
       * Resume the socket.
       *
       * @public
       */
      resume() {
        if (this.readyState === _WebSocket.CONNECTING || this.readyState === _WebSocket.CLOSED) {
          return;
        }
        this._paused = false;
        if (!this._receiver._writableState.needDrain) this._socket.resume();
      }
      /**
       * Send a data message.
       *
       * @param {*} data The message to send
       * @param {Object} [options] Options object
       * @param {Boolean} [options.binary] Specifies whether `data` is binary or
       *     text
       * @param {Boolean} [options.compress] Specifies whether or not to compress
       *     `data`
       * @param {Boolean} [options.fin=true] Specifies whether the fragment is the
       *     last one
       * @param {Boolean} [options.mask] Specifies whether or not to mask `data`
       * @param {Function} [cb] Callback which is executed when data is written out
       * @public
       */
      send(data, options, cb) {
        if (this.readyState === _WebSocket.CONNECTING) {
          throw new Error("WebSocket is not open: readyState 0 (CONNECTING)");
        }
        if (typeof options === "function") {
          cb = options;
          options = {};
        }
        if (typeof data === "number") data = data.toString();
        if (this.readyState !== _WebSocket.OPEN) {
          sendAfterClose(this, data, cb);
          return;
        }
        const opts = {
          binary: typeof data !== "string",
          mask: !this._isServer,
          compress: true,
          fin: true,
          ...options
        };
        if (!this._extensions[PerMessageDeflate.extensionName]) {
          opts.compress = false;
        }
        this._sender.send(data || EMPTY_BUFFER, opts, cb);
      }
      /**
       * Forcibly close the connection.
       *
       * @public
       */
      terminate() {
        if (this.readyState === _WebSocket.CLOSED) return;
        if (this.readyState === _WebSocket.CONNECTING) {
          const msg = "WebSocket was closed before the connection was established";
          abortHandshake(this, this._req, msg);
          return;
        }
        if (this._socket) {
          this._readyState = _WebSocket.CLOSING;
          this._socket.destroy();
        }
      }
    };
    Object.defineProperty(WebSocket2, "CONNECTING", {
      enumerable: true,
      value: readyStates.indexOf("CONNECTING")
    });
    Object.defineProperty(WebSocket2.prototype, "CONNECTING", {
      enumerable: true,
      value: readyStates.indexOf("CONNECTING")
    });
    Object.defineProperty(WebSocket2, "OPEN", {
      enumerable: true,
      value: readyStates.indexOf("OPEN")
    });
    Object.defineProperty(WebSocket2.prototype, "OPEN", {
      enumerable: true,
      value: readyStates.indexOf("OPEN")
    });
    Object.defineProperty(WebSocket2, "CLOSING", {
      enumerable: true,
      value: readyStates.indexOf("CLOSING")
    });
    Object.defineProperty(WebSocket2.prototype, "CLOSING", {
      enumerable: true,
      value: readyStates.indexOf("CLOSING")
    });
    Object.defineProperty(WebSocket2, "CLOSED", {
      enumerable: true,
      value: readyStates.indexOf("CLOSED")
    });
    Object.defineProperty(WebSocket2.prototype, "CLOSED", {
      enumerable: true,
      value: readyStates.indexOf("CLOSED")
    });
    [
      "binaryType",
      "bufferedAmount",
      "extensions",
      "isPaused",
      "protocol",
      "readyState",
      "url"
    ].forEach((property2) => {
      Object.defineProperty(WebSocket2.prototype, property2, { enumerable: true });
    });
    ["open", "error", "close", "message"].forEach((method) => {
      Object.defineProperty(WebSocket2.prototype, `on${method}`, {
        enumerable: true,
        get() {
          for (const listener of this.listeners(method)) {
            if (listener[kForOnEventAttribute]) return listener[kListener];
          }
          return null;
        },
        set(handler) {
          for (const listener of this.listeners(method)) {
            if (listener[kForOnEventAttribute]) {
              this.removeListener(method, listener);
              break;
            }
          }
          if (typeof handler !== "function") return;
          this.addEventListener(method, handler, {
            [kForOnEventAttribute]: true
          });
        }
      });
    });
    WebSocket2.prototype.addEventListener = addEventListener;
    WebSocket2.prototype.removeEventListener = removeEventListener;
    module.exports = WebSocket2;
    function initAsClient(websocket, address, protocols, options) {
      const opts = {
        allowSynchronousEvents: true,
        autoPong: true,
        protocolVersion: protocolVersions[1],
        maxPayload: 100 * 1024 * 1024,
        skipUTF8Validation: false,
        perMessageDeflate: true,
        followRedirects: false,
        maxRedirects: 10,
        ...options,
        socketPath: void 0,
        hostname: void 0,
        protocol: void 0,
        timeout: void 0,
        method: "GET",
        host: void 0,
        path: void 0,
        port: void 0
      };
      websocket._autoPong = opts.autoPong;
      if (!protocolVersions.includes(opts.protocolVersion)) {
        throw new RangeError(
          `Unsupported protocol version: ${opts.protocolVersion} (supported versions: ${protocolVersions.join(", ")})`
        );
      }
      let parsedUrl;
      if (address instanceof URL3) {
        parsedUrl = address;
      } else {
        try {
          parsedUrl = new URL3(address);
        } catch (e) {
          throw new SyntaxError(`Invalid URL: ${address}`);
        }
      }
      if (parsedUrl.protocol === "http:") {
        parsedUrl.protocol = "ws:";
      } else if (parsedUrl.protocol === "https:") {
        parsedUrl.protocol = "wss:";
      }
      websocket._url = parsedUrl.href;
      const isSecure = parsedUrl.protocol === "wss:";
      const isIpcUrl = parsedUrl.protocol === "ws+unix:";
      let invalidUrlMessage;
      if (parsedUrl.protocol !== "ws:" && !isSecure && !isIpcUrl) {
        invalidUrlMessage = `The URL's protocol must be one of "ws:", "wss:", "http:", "https:", or "ws+unix:"`;
      } else if (isIpcUrl && !parsedUrl.pathname) {
        invalidUrlMessage = "The URL's pathname is empty";
      } else if (parsedUrl.hash) {
        invalidUrlMessage = "The URL contains a fragment identifier";
      }
      if (invalidUrlMessage) {
        const err2 = new SyntaxError(invalidUrlMessage);
        if (websocket._redirects === 0) {
          throw err2;
        } else {
          emitErrorAndClose(websocket, err2);
          return;
        }
      }
      const defaultPort = isSecure ? 443 : 80;
      const key = randomBytes3(16).toString("base64");
      const request = isSecure ? https.request : http.request;
      const protocolSet = /* @__PURE__ */ new Set();
      let perMessageDeflate;
      opts.createConnection = opts.createConnection || (isSecure ? tlsConnect : netConnect);
      opts.defaultPort = opts.defaultPort || defaultPort;
      opts.port = parsedUrl.port || defaultPort;
      opts.host = parsedUrl.hostname.startsWith("[") ? parsedUrl.hostname.slice(1, -1) : parsedUrl.hostname;
      opts.headers = {
        ...opts.headers,
        "Sec-WebSocket-Version": opts.protocolVersion,
        "Sec-WebSocket-Key": key,
        Connection: "Upgrade",
        Upgrade: "websocket"
      };
      opts.path = parsedUrl.pathname + parsedUrl.search;
      opts.timeout = opts.handshakeTimeout;
      if (opts.perMessageDeflate) {
        perMessageDeflate = new PerMessageDeflate(
          opts.perMessageDeflate !== true ? opts.perMessageDeflate : {},
          false,
          opts.maxPayload
        );
        opts.headers["Sec-WebSocket-Extensions"] = format({
          [PerMessageDeflate.extensionName]: perMessageDeflate.offer()
        });
      }
      if (protocols.length) {
        for (const protocol of protocols) {
          if (typeof protocol !== "string" || !subprotocolRegex.test(protocol) || protocolSet.has(protocol)) {
            throw new SyntaxError(
              "An invalid or duplicated subprotocol was specified"
            );
          }
          protocolSet.add(protocol);
        }
        opts.headers["Sec-WebSocket-Protocol"] = protocols.join(",");
      }
      if (opts.origin) {
        if (opts.protocolVersion < 13) {
          opts.headers["Sec-WebSocket-Origin"] = opts.origin;
        } else {
          opts.headers.Origin = opts.origin;
        }
      }
      if (parsedUrl.username || parsedUrl.password) {
        opts.auth = `${parsedUrl.username}:${parsedUrl.password}`;
      }
      if (isIpcUrl) {
        const parts = opts.path.split(":");
        opts.socketPath = parts[0];
        opts.path = parts[1];
      }
      let req;
      if (opts.followRedirects) {
        if (websocket._redirects === 0) {
          websocket._originalIpc = isIpcUrl;
          websocket._originalSecure = isSecure;
          websocket._originalHostOrSocketPath = isIpcUrl ? opts.socketPath : parsedUrl.host;
          const headers = options && options.headers;
          options = { ...options, headers: {} };
          if (headers) {
            for (const [key2, value] of Object.entries(headers)) {
              options.headers[key2.toLowerCase()] = value;
            }
          }
        } else if (websocket.listenerCount("redirect") === 0) {
          const isSameHost = isIpcUrl ? websocket._originalIpc ? opts.socketPath === websocket._originalHostOrSocketPath : false : websocket._originalIpc ? false : parsedUrl.host === websocket._originalHostOrSocketPath;
          if (!isSameHost || websocket._originalSecure && !isSecure) {
            delete opts.headers.authorization;
            delete opts.headers.cookie;
            if (!isSameHost) delete opts.headers.host;
            opts.auth = void 0;
          }
        }
        if (opts.auth && !options.headers.authorization) {
          options.headers.authorization = "Basic " + Buffer.from(opts.auth).toString("base64");
        }
        req = websocket._req = request(opts);
        if (websocket._redirects) {
          websocket.emit("redirect", websocket.url, req);
        }
      } else {
        req = websocket._req = request(opts);
      }
      if (opts.timeout) {
        req.on("timeout", () => {
          abortHandshake(websocket, req, "Opening handshake has timed out");
        });
      }
      req.on("error", (err2) => {
        if (req === null || req[kAborted]) return;
        req = websocket._req = null;
        emitErrorAndClose(websocket, err2);
      });
      req.on("response", (res) => {
        const location = res.headers.location;
        const statusCode = res.statusCode;
        if (location && opts.followRedirects && statusCode >= 300 && statusCode < 400) {
          if (++websocket._redirects > opts.maxRedirects) {
            abortHandshake(websocket, req, "Maximum redirects exceeded");
            return;
          }
          req.abort();
          let addr;
          try {
            addr = new URL3(location, address);
          } catch (e) {
            const err2 = new SyntaxError(`Invalid URL: ${location}`);
            emitErrorAndClose(websocket, err2);
            return;
          }
          initAsClient(websocket, addr, protocols, options);
        } else if (!websocket.emit("unexpected-response", req, res)) {
          abortHandshake(
            websocket,
            req,
            `Unexpected server response: ${res.statusCode}`
          );
        }
      });
      req.on("upgrade", (res, socket, head) => {
        websocket.emit("upgrade", res);
        if (websocket.readyState !== WebSocket2.CONNECTING) return;
        req = websocket._req = null;
        const upgrade = res.headers.upgrade;
        if (upgrade === void 0 || upgrade.toLowerCase() !== "websocket") {
          abortHandshake(websocket, socket, "Invalid Upgrade header");
          return;
        }
        const digest = createHash3("sha1").update(key + GUID).digest("base64");
        if (res.headers["sec-websocket-accept"] !== digest) {
          abortHandshake(websocket, socket, "Invalid Sec-WebSocket-Accept header");
          return;
        }
        const serverProt = res.headers["sec-websocket-protocol"];
        let protError;
        if (serverProt !== void 0) {
          if (!protocolSet.size) {
            protError = "Server sent a subprotocol but none was requested";
          } else if (!protocolSet.has(serverProt)) {
            protError = "Server sent an invalid subprotocol";
          }
        } else if (protocolSet.size) {
          protError = "Server sent no subprotocol";
        }
        if (protError) {
          abortHandshake(websocket, socket, protError);
          return;
        }
        if (serverProt) websocket._protocol = serverProt;
        const secWebSocketExtensions = res.headers["sec-websocket-extensions"];
        if (secWebSocketExtensions !== void 0) {
          if (!perMessageDeflate) {
            const message = "Server sent a Sec-WebSocket-Extensions header but no extension was requested";
            abortHandshake(websocket, socket, message);
            return;
          }
          let extensions;
          try {
            extensions = parse(secWebSocketExtensions);
          } catch (err2) {
            const message = "Invalid Sec-WebSocket-Extensions header";
            abortHandshake(websocket, socket, message);
            return;
          }
          const extensionNames = Object.keys(extensions);
          if (extensionNames.length !== 1 || extensionNames[0] !== PerMessageDeflate.extensionName) {
            const message = "Server indicated an extension that was not requested";
            abortHandshake(websocket, socket, message);
            return;
          }
          try {
            perMessageDeflate.accept(extensions[PerMessageDeflate.extensionName]);
          } catch (err2) {
            const message = "Invalid Sec-WebSocket-Extensions header";
            abortHandshake(websocket, socket, message);
            return;
          }
          websocket._extensions[PerMessageDeflate.extensionName] = perMessageDeflate;
        }
        websocket.setSocket(socket, head, {
          allowSynchronousEvents: opts.allowSynchronousEvents,
          generateMask: opts.generateMask,
          maxPayload: opts.maxPayload,
          skipUTF8Validation: opts.skipUTF8Validation
        });
      });
      if (opts.finishRequest) {
        opts.finishRequest(req, websocket);
      } else {
        req.end();
      }
    }
    function emitErrorAndClose(websocket, err2) {
      websocket._readyState = WebSocket2.CLOSING;
      websocket._errorEmitted = true;
      websocket.emit("error", err2);
      websocket.emitClose();
    }
    function netConnect(options) {
      options.path = options.socketPath;
      return net.connect(options);
    }
    function tlsConnect(options) {
      options.path = void 0;
      if (!options.servername && options.servername !== "") {
        options.servername = net.isIP(options.host) ? "" : options.host;
      }
      return tls.connect(options);
    }
    function abortHandshake(websocket, stream, message) {
      websocket._readyState = WebSocket2.CLOSING;
      const err2 = new Error(message);
      Error.captureStackTrace(err2, abortHandshake);
      if (stream.setHeader) {
        stream[kAborted] = true;
        stream.abort();
        if (stream.socket && !stream.socket.destroyed) {
          stream.socket.destroy();
        }
        process.nextTick(emitErrorAndClose, websocket, err2);
      } else {
        stream.destroy(err2);
        stream.once("error", websocket.emit.bind(websocket, "error"));
        stream.once("close", websocket.emitClose.bind(websocket));
      }
    }
    function sendAfterClose(websocket, data, cb) {
      if (data) {
        const length = isBlob(data) ? data.size : toBuffer(data).length;
        if (websocket._socket) websocket._sender._bufferedBytes += length;
        else websocket._bufferedAmount += length;
      }
      if (cb) {
        const err2 = new Error(
          `WebSocket is not open: readyState ${websocket.readyState} (${readyStates[websocket.readyState]})`
        );
        process.nextTick(cb, err2);
      }
    }
    function receiverOnConclude(code, reason) {
      const websocket = this[kWebSocket];
      websocket._closeFrameReceived = true;
      websocket._closeMessage = reason;
      websocket._closeCode = code;
      if (websocket._socket[kWebSocket] === void 0) return;
      websocket._socket.removeListener("data", socketOnData);
      process.nextTick(resume, websocket._socket);
      if (code === 1005) websocket.close();
      else websocket.close(code, reason);
    }
    function receiverOnDrain() {
      const websocket = this[kWebSocket];
      if (!websocket.isPaused) websocket._socket.resume();
    }
    function receiverOnError(err2) {
      const websocket = this[kWebSocket];
      if (websocket._socket[kWebSocket] !== void 0) {
        websocket._socket.removeListener("data", socketOnData);
        process.nextTick(resume, websocket._socket);
        websocket.close(err2[kStatusCode]);
      }
      if (!websocket._errorEmitted) {
        websocket._errorEmitted = true;
        websocket.emit("error", err2);
      }
    }
    function receiverOnFinish() {
      this[kWebSocket].emitClose();
    }
    function receiverOnMessage(data, isBinary) {
      this[kWebSocket].emit("message", data, isBinary);
    }
    function receiverOnPing(data) {
      const websocket = this[kWebSocket];
      if (websocket._autoPong) websocket.pong(data, !this._isServer, NOOP);
      websocket.emit("ping", data);
    }
    function receiverOnPong(data) {
      this[kWebSocket].emit("pong", data);
    }
    function resume(stream) {
      stream.resume();
    }
    function senderOnError(err2) {
      const websocket = this[kWebSocket];
      if (websocket.readyState === WebSocket2.CLOSED) return;
      if (websocket.readyState === WebSocket2.OPEN) {
        websocket._readyState = WebSocket2.CLOSING;
        setCloseTimer(websocket);
      }
      this._socket.end();
      if (!websocket._errorEmitted) {
        websocket._errorEmitted = true;
        websocket.emit("error", err2);
      }
    }
    function setCloseTimer(websocket) {
      websocket._closeTimer = setTimeout(
        websocket._socket.destroy.bind(websocket._socket),
        closeTimeout
      );
    }
    function socketOnClose() {
      const websocket = this[kWebSocket];
      this.removeListener("close", socketOnClose);
      this.removeListener("data", socketOnData);
      this.removeListener("end", socketOnEnd);
      websocket._readyState = WebSocket2.CLOSING;
      let chunk;
      if (!this._readableState.endEmitted && !websocket._closeFrameReceived && !websocket._receiver._writableState.errorEmitted && (chunk = websocket._socket.read()) !== null) {
        websocket._receiver.write(chunk);
      }
      websocket._receiver.end();
      this[kWebSocket] = void 0;
      clearTimeout(websocket._closeTimer);
      if (websocket._receiver._writableState.finished || websocket._receiver._writableState.errorEmitted) {
        websocket.emitClose();
      } else {
        websocket._receiver.on("error", receiverOnFinish);
        websocket._receiver.on("finish", receiverOnFinish);
      }
    }
    function socketOnData(chunk) {
      if (!this[kWebSocket]._receiver.write(chunk)) {
        this.pause();
      }
    }
    function socketOnEnd() {
      const websocket = this[kWebSocket];
      websocket._readyState = WebSocket2.CLOSING;
      websocket._receiver.end();
      this.end();
    }
    function socketOnError() {
      const websocket = this[kWebSocket];
      this.removeListener("error", socketOnError);
      this.on("error", NOOP);
      if (websocket) {
        websocket._readyState = WebSocket2.CLOSING;
        this.destroy();
      }
    }
  }
});

// node_modules/ws/lib/stream.js
var require_stream = __commonJS({
  "node_modules/ws/lib/stream.js"(exports, module) {
    "use strict";
    var WebSocket2 = require_websocket();
    var { Duplex } = __require("stream");
    function emitClose(stream) {
      stream.emit("close");
    }
    function duplexOnEnd() {
      if (!this.destroyed && this._writableState.finished) {
        this.destroy();
      }
    }
    function duplexOnError(err2) {
      this.removeListener("error", duplexOnError);
      this.destroy();
      if (this.listenerCount("error") === 0) {
        this.emit("error", err2);
      }
    }
    function createWebSocketStream2(ws, options) {
      let terminateOnDestroy = true;
      const duplex = new Duplex({
        ...options,
        autoDestroy: false,
        emitClose: false,
        objectMode: false,
        writableObjectMode: false
      });
      ws.on("message", function message(msg, isBinary) {
        const data = !isBinary && duplex._readableState.objectMode ? msg.toString() : msg;
        if (!duplex.push(data)) ws.pause();
      });
      ws.once("error", function error2(err2) {
        if (duplex.destroyed) return;
        terminateOnDestroy = false;
        duplex.destroy(err2);
      });
      ws.once("close", function close() {
        if (duplex.destroyed) return;
        duplex.push(null);
      });
      duplex._destroy = function(err2, callback) {
        if (ws.readyState === ws.CLOSED) {
          callback(err2);
          process.nextTick(emitClose, duplex);
          return;
        }
        let called = false;
        ws.once("error", function error2(err3) {
          called = true;
          callback(err3);
        });
        ws.once("close", function close() {
          if (!called) callback(err2);
          process.nextTick(emitClose, duplex);
        });
        if (terminateOnDestroy) ws.terminate();
      };
      duplex._final = function(callback) {
        if (ws.readyState === ws.CONNECTING) {
          ws.once("open", function open2() {
            duplex._final(callback);
          });
          return;
        }
        if (ws._socket === null) return;
        if (ws._socket._writableState.finished) {
          callback();
          if (duplex._readableState.endEmitted) duplex.destroy();
        } else {
          ws._socket.once("finish", function finish() {
            callback();
          });
          ws.close();
        }
      };
      duplex._read = function() {
        if (ws.isPaused) ws.resume();
      };
      duplex._write = function(chunk, encoding, callback) {
        if (ws.readyState === ws.CONNECTING) {
          ws.once("open", function open2() {
            duplex._write(chunk, encoding, callback);
          });
          return;
        }
        ws.send(chunk, callback);
      };
      duplex.on("end", duplexOnEnd);
      duplex.on("error", duplexOnError);
      return duplex;
    }
    module.exports = createWebSocketStream2;
  }
});

// node_modules/ws/lib/subprotocol.js
var require_subprotocol = __commonJS({
  "node_modules/ws/lib/subprotocol.js"(exports, module) {
    "use strict";
    var { tokenChars } = require_validation();
    function parse(header) {
      const protocols = /* @__PURE__ */ new Set();
      let start = -1;
      let end = -1;
      let i = 0;
      for (i; i < header.length; i++) {
        const code = header.charCodeAt(i);
        if (end === -1 && tokenChars[code] === 1) {
          if (start === -1) start = i;
        } else if (i !== 0 && (code === 32 || code === 9)) {
          if (end === -1 && start !== -1) end = i;
        } else if (code === 44) {
          if (start === -1) {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
          if (end === -1) end = i;
          const protocol2 = header.slice(start, end);
          if (protocols.has(protocol2)) {
            throw new SyntaxError(`The "${protocol2}" subprotocol is duplicated`);
          }
          protocols.add(protocol2);
          start = end = -1;
        } else {
          throw new SyntaxError(`Unexpected character at index ${i}`);
        }
      }
      if (start === -1 || end !== -1) {
        throw new SyntaxError("Unexpected end of input");
      }
      const protocol = header.slice(start, i);
      if (protocols.has(protocol)) {
        throw new SyntaxError(`The "${protocol}" subprotocol is duplicated`);
      }
      protocols.add(protocol);
      return protocols;
    }
    module.exports = { parse };
  }
});

// node_modules/ws/lib/websocket-server.js
var require_websocket_server = __commonJS({
  "node_modules/ws/lib/websocket-server.js"(exports, module) {
    "use strict";
    var EventEmitter = __require("events");
    var http = __require("http");
    var { Duplex } = __require("stream");
    var { createHash: createHash3 } = __require("crypto");
    var extension = require_extension();
    var PerMessageDeflate = require_permessage_deflate();
    var subprotocol = require_subprotocol();
    var WebSocket2 = require_websocket();
    var { GUID, kWebSocket } = require_constants();
    var keyRegex = /^[+/0-9A-Za-z]{22}==$/;
    var RUNNING = 0;
    var CLOSING = 1;
    var CLOSED = 2;
    var WebSocketServer2 = class extends EventEmitter {
      /**
       * Create a `WebSocketServer` instance.
       *
       * @param {Object} options Configuration options
       * @param {Boolean} [options.allowSynchronousEvents=true] Specifies whether
       *     any of the `'message'`, `'ping'`, and `'pong'` events can be emitted
       *     multiple times in the same tick
       * @param {Boolean} [options.autoPong=true] Specifies whether or not to
       *     automatically send a pong in response to a ping
       * @param {Number} [options.backlog=511] The maximum length of the queue of
       *     pending connections
       * @param {Boolean} [options.clientTracking=true] Specifies whether or not to
       *     track clients
       * @param {Function} [options.handleProtocols] A hook to handle protocols
       * @param {String} [options.host] The hostname where to bind the server
       * @param {Number} [options.maxPayload=104857600] The maximum allowed message
       *     size
       * @param {Boolean} [options.noServer=false] Enable no server mode
       * @param {String} [options.path] Accept only connections matching this path
       * @param {(Boolean|Object)} [options.perMessageDeflate=false] Enable/disable
       *     permessage-deflate
       * @param {Number} [options.port] The port where to bind the server
       * @param {(http.Server|https.Server)} [options.server] A pre-created HTTP/S
       *     server to use
       * @param {Boolean} [options.skipUTF8Validation=false] Specifies whether or
       *     not to skip UTF-8 validation for text and close messages
       * @param {Function} [options.verifyClient] A hook to reject connections
       * @param {Function} [options.WebSocket=WebSocket] Specifies the `WebSocket`
       *     class to use. It must be the `WebSocket` class or class that extends it
       * @param {Function} [callback] A listener for the `listening` event
       */
      constructor(options, callback) {
        super();
        options = {
          allowSynchronousEvents: true,
          autoPong: true,
          maxPayload: 100 * 1024 * 1024,
          skipUTF8Validation: false,
          perMessageDeflate: false,
          handleProtocols: null,
          clientTracking: true,
          verifyClient: null,
          noServer: false,
          backlog: null,
          // use default (511 as implemented in net.js)
          server: null,
          host: null,
          path: null,
          port: null,
          WebSocket: WebSocket2,
          ...options
        };
        if (options.port == null && !options.server && !options.noServer || options.port != null && (options.server || options.noServer) || options.server && options.noServer) {
          throw new TypeError(
            'One and only one of the "port", "server", or "noServer" options must be specified'
          );
        }
        if (options.port != null) {
          this._server = http.createServer((req, res) => {
            const body = http.STATUS_CODES[426];
            res.writeHead(426, {
              "Content-Length": body.length,
              "Content-Type": "text/plain"
            });
            res.end(body);
          });
          this._server.listen(
            options.port,
            options.host,
            options.backlog,
            callback
          );
        } else if (options.server) {
          this._server = options.server;
        }
        if (this._server) {
          const emitConnection = this.emit.bind(this, "connection");
          this._removeListeners = addListeners(this._server, {
            listening: this.emit.bind(this, "listening"),
            error: this.emit.bind(this, "error"),
            upgrade: (req, socket, head) => {
              this.handleUpgrade(req, socket, head, emitConnection);
            }
          });
        }
        if (options.perMessageDeflate === true) options.perMessageDeflate = {};
        if (options.clientTracking) {
          this.clients = /* @__PURE__ */ new Set();
          this._shouldEmitClose = false;
        }
        this.options = options;
        this._state = RUNNING;
      }
      /**
       * Returns the bound address, the address family name, and port of the server
       * as reported by the operating system if listening on an IP socket.
       * If the server is listening on a pipe or UNIX domain socket, the name is
       * returned as a string.
       *
       * @return {(Object|String|null)} The address of the server
       * @public
       */
      address() {
        if (this.options.noServer) {
          throw new Error('The server is operating in "noServer" mode');
        }
        if (!this._server) return null;
        return this._server.address();
      }
      /**
       * Stop the server from accepting new connections and emit the `'close'` event
       * when all existing connections are closed.
       *
       * @param {Function} [cb] A one-time listener for the `'close'` event
       * @public
       */
      close(cb) {
        if (this._state === CLOSED) {
          if (cb) {
            this.once("close", () => {
              cb(new Error("The server is not running"));
            });
          }
          process.nextTick(emitClose, this);
          return;
        }
        if (cb) this.once("close", cb);
        if (this._state === CLOSING) return;
        this._state = CLOSING;
        if (this.options.noServer || this.options.server) {
          if (this._server) {
            this._removeListeners();
            this._removeListeners = this._server = null;
          }
          if (this.clients) {
            if (!this.clients.size) {
              process.nextTick(emitClose, this);
            } else {
              this._shouldEmitClose = true;
            }
          } else {
            process.nextTick(emitClose, this);
          }
        } else {
          const server = this._server;
          this._removeListeners();
          this._removeListeners = this._server = null;
          server.close(() => {
            emitClose(this);
          });
        }
      }
      /**
       * See if a given request should be handled by this server instance.
       *
       * @param {http.IncomingMessage} req Request object to inspect
       * @return {Boolean} `true` if the request is valid, else `false`
       * @public
       */
      shouldHandle(req) {
        if (this.options.path) {
          const index = req.url.indexOf("?");
          const pathname = index !== -1 ? req.url.slice(0, index) : req.url;
          if (pathname !== this.options.path) return false;
        }
        return true;
      }
      /**
       * Handle a HTTP Upgrade request.
       *
       * @param {http.IncomingMessage} req The request object
       * @param {Duplex} socket The network socket between the server and client
       * @param {Buffer} head The first packet of the upgraded stream
       * @param {Function} cb Callback
       * @public
       */
      handleUpgrade(req, socket, head, cb) {
        socket.on("error", socketOnError);
        const key = req.headers["sec-websocket-key"];
        const upgrade = req.headers.upgrade;
        const version2 = +req.headers["sec-websocket-version"];
        if (req.method !== "GET") {
          const message = "Invalid HTTP method";
          abortHandshakeOrEmitwsClientError(this, req, socket, 405, message);
          return;
        }
        if (upgrade === void 0 || upgrade.toLowerCase() !== "websocket") {
          const message = "Invalid Upgrade header";
          abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
          return;
        }
        if (key === void 0 || !keyRegex.test(key)) {
          const message = "Missing or invalid Sec-WebSocket-Key header";
          abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
          return;
        }
        if (version2 !== 13 && version2 !== 8) {
          const message = "Missing or invalid Sec-WebSocket-Version header";
          abortHandshakeOrEmitwsClientError(this, req, socket, 400, message, {
            "Sec-WebSocket-Version": "13, 8"
          });
          return;
        }
        if (!this.shouldHandle(req)) {
          abortHandshake(socket, 400);
          return;
        }
        const secWebSocketProtocol = req.headers["sec-websocket-protocol"];
        let protocols = /* @__PURE__ */ new Set();
        if (secWebSocketProtocol !== void 0) {
          try {
            protocols = subprotocol.parse(secWebSocketProtocol);
          } catch (err2) {
            const message = "Invalid Sec-WebSocket-Protocol header";
            abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
            return;
          }
        }
        const secWebSocketExtensions = req.headers["sec-websocket-extensions"];
        const extensions = {};
        if (this.options.perMessageDeflate && secWebSocketExtensions !== void 0) {
          const perMessageDeflate = new PerMessageDeflate(
            this.options.perMessageDeflate,
            true,
            this.options.maxPayload
          );
          try {
            const offers = extension.parse(secWebSocketExtensions);
            if (offers[PerMessageDeflate.extensionName]) {
              perMessageDeflate.accept(offers[PerMessageDeflate.extensionName]);
              extensions[PerMessageDeflate.extensionName] = perMessageDeflate;
            }
          } catch (err2) {
            const message = "Invalid or unacceptable Sec-WebSocket-Extensions header";
            abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
            return;
          }
        }
        if (this.options.verifyClient) {
          const info = {
            origin: req.headers[`${version2 === 8 ? "sec-websocket-origin" : "origin"}`],
            secure: !!(req.socket.authorized || req.socket.encrypted),
            req
          };
          if (this.options.verifyClient.length === 2) {
            this.options.verifyClient(info, (verified, code, message, headers) => {
              if (!verified) {
                return abortHandshake(socket, code || 401, message, headers);
              }
              this.completeUpgrade(
                extensions,
                key,
                protocols,
                req,
                socket,
                head,
                cb
              );
            });
            return;
          }
          if (!this.options.verifyClient(info)) return abortHandshake(socket, 401);
        }
        this.completeUpgrade(extensions, key, protocols, req, socket, head, cb);
      }
      /**
       * Upgrade the connection to WebSocket.
       *
       * @param {Object} extensions The accepted extensions
       * @param {String} key The value of the `Sec-WebSocket-Key` header
       * @param {Set} protocols The subprotocols
       * @param {http.IncomingMessage} req The request object
       * @param {Duplex} socket The network socket between the server and client
       * @param {Buffer} head The first packet of the upgraded stream
       * @param {Function} cb Callback
       * @throws {Error} If called more than once with the same socket
       * @private
       */
      completeUpgrade(extensions, key, protocols, req, socket, head, cb) {
        if (!socket.readable || !socket.writable) return socket.destroy();
        if (socket[kWebSocket]) {
          throw new Error(
            "server.handleUpgrade() was called more than once with the same socket, possibly due to a misconfiguration"
          );
        }
        if (this._state > RUNNING) return abortHandshake(socket, 503);
        const digest = createHash3("sha1").update(key + GUID).digest("base64");
        const headers = [
          "HTTP/1.1 101 Switching Protocols",
          "Upgrade: websocket",
          "Connection: Upgrade",
          `Sec-WebSocket-Accept: ${digest}`
        ];
        const ws = new this.options.WebSocket(null, void 0, this.options);
        if (protocols.size) {
          const protocol = this.options.handleProtocols ? this.options.handleProtocols(protocols, req) : protocols.values().next().value;
          if (protocol) {
            headers.push(`Sec-WebSocket-Protocol: ${protocol}`);
            ws._protocol = protocol;
          }
        }
        if (extensions[PerMessageDeflate.extensionName]) {
          const params = extensions[PerMessageDeflate.extensionName].params;
          const value = extension.format({
            [PerMessageDeflate.extensionName]: [params]
          });
          headers.push(`Sec-WebSocket-Extensions: ${value}`);
          ws._extensions = extensions;
        }
        this.emit("headers", headers, req);
        socket.write(headers.concat("\r\n").join("\r\n"));
        socket.removeListener("error", socketOnError);
        ws.setSocket(socket, head, {
          allowSynchronousEvents: this.options.allowSynchronousEvents,
          maxPayload: this.options.maxPayload,
          skipUTF8Validation: this.options.skipUTF8Validation
        });
        if (this.clients) {
          this.clients.add(ws);
          ws.on("close", () => {
            this.clients.delete(ws);
            if (this._shouldEmitClose && !this.clients.size) {
              process.nextTick(emitClose, this);
            }
          });
        }
        cb(ws, req);
      }
    };
    module.exports = WebSocketServer2;
    function addListeners(server, map) {
      for (const event of Object.keys(map)) server.on(event, map[event]);
      return function removeListeners() {
        for (const event of Object.keys(map)) {
          server.removeListener(event, map[event]);
        }
      };
    }
    function emitClose(server) {
      server._state = CLOSED;
      server.emit("close");
    }
    function socketOnError() {
      this.destroy();
    }
    function abortHandshake(socket, code, message, headers) {
      message = message || http.STATUS_CODES[code];
      headers = {
        Connection: "close",
        "Content-Type": "text/html",
        "Content-Length": Buffer.byteLength(message),
        ...headers
      };
      socket.once("finish", socket.destroy);
      socket.end(
        `HTTP/1.1 ${code} ${http.STATUS_CODES[code]}\r
` + Object.keys(headers).map((h) => `${h}: ${headers[h]}`).join("\r\n") + "\r\n\r\n" + message
      );
    }
    function abortHandshakeOrEmitwsClientError(server, req, socket, code, message, headers) {
      if (server.listenerCount("wsClientError")) {
        const err2 = new Error(message);
        Error.captureStackTrace(err2, abortHandshakeOrEmitwsClientError);
        server.emit("wsClientError", err2, socket, req);
      } else {
        abortHandshake(socket, code, message, headers);
      }
    }
  }
});

// src/daemon-main.ts
import { resolve as resolve3 } from "node:path";

// src/daemon-server.ts
import { createHash as createHash2, randomBytes as randomBytes2 } from "node:crypto";
import { createServer } from "node:http";
import { readFile as readFile5, realpath as realpath6, rm as rm2 } from "node:fs/promises";
import { basename } from "node:path";
import { URL as URL2 } from "node:url";

// node_modules/ws/wrapper.mjs
var import_stream = __toESM(require_stream(), 1);
var import_receiver = __toESM(require_receiver(), 1);
var import_sender = __toESM(require_sender(), 1);
var import_websocket = __toESM(require_websocket(), 1);
var import_websocket_server = __toESM(require_websocket_server(), 1);

// src/routes.ts
import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
var MAX_JSON_BODY_BYTES = 2 * 1024 * 1024;
function runNative(command, args) {
  return new Promise((resolve4) => {
    execFile(command, args, { encoding: "utf8" }, (error2, stdout, stderr) => {
      if (error2 !== null) {
        resolve4({ stdout, stderr, code: error2.code });
        return;
      }
      resolve4({ stdout, stderr });
    });
  });
}
async function chooseExportPath(defaultName) {
  if (process.platform !== "darwin") throw new Error(`native export is unsupported on ${process.platform}`);
  const script = [
    "ObjC.import('Cocoa')",
    "function run(argv) {",
    "  const panel = $.NSSavePanel.savePanel",
    '  panel.title = "\u5BFC\u51FA\u753B\u677F"',
    '  panel.nameFieldStringValue = argv[0] || "prototype.excalidraw"',
    "  panel.canCreateDirectories = true",
    '  if (panel.runModal() !== $.NSModalResponseOK) return ""',
    "  return ObjC.unwrap(panel.URL.path)",
    "}"
  ].join("\n");
  const result = await runNative("/usr/bin/osascript", ["-l", "JavaScript", "-e", script, defaultName]);
  const output = result.stdout.trim();
  const cancelled = result.code === -128 || result.code === "-128" || /user canceled|用户(?:已)?取消/i.test(`${result.stderr} ${result.stdout}`);
  if (cancelled) return null;
  if (result.code !== void 0) {
    throw new Error(result.stderr.trim() || "native save dialog failed");
  }
  if (output === "") return null;
  return output;
}
function isLoopbackRequest(request) {
  const address = request.socket.remoteAddress;
  if (address !== "127.0.0.1" && address !== "::1" && address !== "::ffff:127.0.0.1") return false;
  const host = request.headers.host;
  if (typeof host !== "string") return false;
  let hostUrl;
  try {
    hostUrl = new URL(`http://${host}`);
  } catch {
    return false;
  }
  if (hostUrl.hostname !== "127.0.0.1" && hostUrl.hostname !== "localhost" && hostUrl.hostname !== "[::1]") return false;
  if (request.headers["sec-fetch-site"] === "cross-site") return false;
  const origin = request.headers.origin;
  if (origin === void 0) return true;
  try {
    return new URL(origin).host === hostUrl.host;
  } catch {
    return false;
  }
}
function writeJson(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(json);
}
async function readJsonBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_JSON_BODY_BYTES) throw new Error("request body too large");
    chunks.push(chunk);
  }
  const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (typeof parsed !== "object" || parsed === null) throw new Error("request body must be a JSON object");
  return parsed;
}
function respond(res, result) {
  if (result.ok) {
    writeJson(res, 200, { ok: true, ...result.value });
  } else {
    const status = result.error.code === "conflict" ? 409 : result.error.code === "not-found" || result.error.code === "workspace-unknown" ? 404 : 400;
    writeJson(res, status, { ok: false, error: result.error });
  }
}
function makeRoutes(store) {
  const guard = (req, res, method) => {
    if (req.method !== method) {
      writeJson(res, 405, { ok: false, error: { code: "method", message: `method not allowed: ${req.method}` } });
      return false;
    }
    if (!isLoopbackRequest(req)) {
      writeJson(res, 403, { ok: false, error: { code: "forbidden", message: "loopback-only" } });
      return false;
    }
    return true;
  };
  const query = (req, key) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const value = url.searchParams.get(key);
    return value === null ? void 0 : value;
  };
  return [
    // -------------------------------------------------- scenes (list)
    {
      kind: "exact",
      path: "/api/draw2code/scenes",
      handler: async (req, res) => {
        if (!guard(req, res, "GET")) return;
        const root = query(req, "root");
        if (root === void 0) {
          writeJson(res, 400, { ok: false, error: { code: "bad-request", message: "missing root" } });
          return;
        }
        const result = await store.list(root);
        if (result.ok) writeJson(res, 200, { ok: true, scenes: result.value });
        else respond(res, result);
      }
    },
    // --------------------------------------------- active board (shared UI state)
    {
      kind: "exact",
      path: "/api/draw2code/active-board",
      handler: async (req, res) => {
        const method = req.method ?? "";
        if (method === "GET") {
          if (!isLoopbackRequest(req)) {
            writeJson(res, 403, { ok: false, error: { code: "forbidden", message: "loopback-only" } });
            return;
          }
          const root = query(req, "root");
          if (root === void 0) {
            writeJson(res, 400, { ok: false, error: { code: "bad-request", message: "missing root" } });
            return;
          }
          respond(res, await store.getActiveBoard(root));
          return;
        }
        if (method === "PUT") {
          if (!guard(req, res, "PUT")) return;
          try {
            const body = await readJsonBody(req);
            respond(res, await store.setActiveBoard(String(body.root ?? ""), String(body.name ?? "")));
          } catch (error2) {
            writeJson(res, 400, { ok: false, error: { code: "bad-request", message: error2 instanceof Error ? error2.message : String(error2) } });
          }
          return;
        }
        writeJson(res, 405, { ok: false, error: { code: "method", message: `method not allowed: ${method}` } });
      }
    },
    // ---------------------------------------- verified update reveal request
    {
      kind: "exact",
      path: "/api/draw2code/reveal-request",
      handler: async (req, res) => {
        const method = req.method ?? "";
        if (method === "GET") {
          if (!guard(req, res, "GET")) return;
          const root = query(req, "root");
          if (root === void 0) {
            writeJson(res, 400, { ok: false, error: { code: "bad-request", message: "missing root" } });
            return;
          }
          respond(res, await store.getBoardReveal(root));
          return;
        }
        if (method === "PUT") {
          if (!guard(req, res, "PUT")) return;
          try {
            const body = await readJsonBody(req);
            respond(res, await store.ackBoardReveal(String(body.root ?? ""), String(body.id ?? ""), String(body.board ?? "")));
          } catch (error2) {
            writeJson(res, 400, { ok: false, error: { code: "bad-request", message: error2 instanceof Error ? error2.message : String(error2) } });
          }
          return;
        }
        writeJson(res, 405, { ok: false, error: { code: "method", message: `method not allowed: ${method}` } });
      }
    },
    // -------------------------------------------------- scene (read / create / delete)
    {
      kind: "exact",
      path: "/api/draw2code/scene",
      handler: async (req, res) => {
        const method = req.method ?? "";
        if (method === "GET") {
          if (!isLoopbackRequest(req)) {
            writeJson(res, 403, { ok: false, error: { code: "forbidden", message: "loopback-only" } });
            return;
          }
          const root = query(req, "root");
          const name = query(req, "name");
          if (root === void 0 || name === void 0) {
            writeJson(res, 400, { ok: false, error: { code: "bad-request", message: "missing root or name" } });
            return;
          }
          const result = await store.read(root, name);
          if (result.ok) {
            writeJson(res, 200, { ok: true, rev: result.value.rev, scene: result.value.scene });
          } else {
            respond(res, result);
          }
          return;
        }
        if (method === "POST") {
          if (!isLoopbackRequest(req)) {
            writeJson(res, 403, { ok: false, error: { code: "forbidden", message: "loopback-only" } });
            return;
          }
          try {
            const body = await readJsonBody(req);
            respond(res, await store.create(String(body.root ?? ""), String(body.name ?? "")));
          } catch (error2) {
            writeJson(res, 400, { ok: false, error: { code: "bad-request", message: error2 instanceof Error ? error2.message : String(error2) } });
          }
          return;
        }
        if (method === "DELETE") {
          if (!isLoopbackRequest(req)) {
            writeJson(res, 403, { ok: false, error: { code: "forbidden", message: "loopback-only" } });
            return;
          }
          const root = query(req, "root");
          const name = query(req, "name");
          if (root === void 0 || name === void 0) {
            writeJson(res, 400, { ok: false, error: { code: "bad-request", message: "missing root or name" } });
            return;
          }
          respond(res, await store.remove(root, name));
          return;
        }
        writeJson(res, 405, { ok: false, error: { code: "method", message: `method not allowed: ${method}` } });
      }
    },
    // -------------------------------------------------- scene (write whole)
    {
      kind: "exact",
      path: "/api/draw2code/scene/write",
      handler: async (req, res) => {
        if (!guard(req, res, "PUT")) return;
        try {
          const body = await readJsonBody(req);
          const baseRev = typeof body.baseRev === "number" ? body.baseRev : void 0;
          respond(res, await store.write(String(body.root ?? ""), String(body.name ?? ""), body.scene, baseRev));
        } catch (error2) {
          writeJson(res, 400, { ok: false, error: { code: "bad-request", message: error2 instanceof Error ? error2.message : String(error2) } });
        }
      }
    },
    // -------------------------------------------------- versions (list / restore)
    {
      kind: "exact",
      path: "/api/draw2code/versions",
      handler: async (req, res) => {
        if (!guard(req, res, "GET")) return;
        const root = query(req, "root");
        const name = query(req, "name");
        if (root === void 0 || name === void 0) {
          writeJson(res, 400, { ok: false, error: { code: "bad-request", message: "missing root or name" } });
          return;
        }
        const result = await store.listVersions(root, name);
        if (result.ok) writeJson(res, 200, { ok: true, versions: result.value });
        else respond(res, result);
      }
    },
    {
      kind: "exact",
      path: "/api/draw2code/version",
      handler: async (req, res) => {
        if (!guard(req, res, "GET")) return;
        const root = query(req, "root");
        const name = query(req, "name");
        const id = query(req, "id");
        if (root === void 0 || name === void 0 || id === void 0) {
          writeJson(res, 400, { ok: false, error: { code: "bad-request", message: "missing root, name or id" } });
          return;
        }
        const result = await store.readVersion(root, name, id);
        if (result.ok) writeJson(res, 200, { ok: true, ...result.value });
        else respond(res, result);
      }
    },
    {
      kind: "exact",
      path: "/api/draw2code/restore",
      handler: async (req, res) => {
        if (!guard(req, res, "POST")) return;
        try {
          const body = await readJsonBody(req);
          respond(res, await store.restoreVersion(String(body.root ?? ""), String(body.name ?? ""), String(body.id ?? "")));
        } catch (error2) {
          writeJson(res, 400, { ok: false, error: { code: "bad-request", message: error2 instanceof Error ? error2.message : String(error2) } });
        }
      }
    },
    // -------------------------------------------------- scene export
    {
      kind: "exact",
      path: "/api/draw2code/export",
      handler: async (req, res) => {
        if (!guard(req, res, "POST")) return;
        try {
          const body = await readJsonBody(req);
          if (typeof body.scene !== "object" || body.scene === null || !Array.isArray(body.scene.elements)) {
            writeJson(res, 400, { ok: false, error: { code: "bad-scene", message: "scene.elements must be an array" } });
            return;
          }
          const json = JSON.stringify(body.scene, null, 2);
          if (typeof json !== "string" || Buffer.byteLength(json) > MAX_JSON_BODY_BYTES) {
            writeJson(res, 400, { ok: false, error: { code: "too-large", message: "scene exceeds export size limit" } });
            return;
          }
          const defaultName = typeof body.filename === "string" && body.filename.trim() !== "" ? body.filename.trim() : "prototype.excalidraw";
          const selectedPath = await chooseExportPath(defaultName);
          if (selectedPath === null) {
            writeJson(res, 200, { ok: true, cancelled: true });
            return;
          }
          await writeFile(selectedPath, `${json}
`, "utf8");
          writeJson(res, 200, { ok: true, exported: true, path: selectedPath });
        } catch (error2) {
          writeJson(res, 500, { ok: false, error: { code: "export-failed", message: error2 instanceof Error ? error2.message : String(error2) } });
        }
      }
    }
  ];
}

// src/scene-store.ts
import { mkdir, readdir, readFile, rename, rm, stat, writeFile as writeFile2 } from "node:fs/promises";
import { realpath } from "node:fs/promises";
import { join } from "node:path";
var SCENE_DIR = "draw2code";
var ACTIVE_BOARD_FILE = ".active-board.json";
var GENERATIONS_DIR = ".generations";
var GENERATE_SETTINGS_DIR = ".generate-settings";
var GENERATION_ID_RE = /^generation-[0-9a-f-]{36}$/;
var PAGES_DIR = "draw2code-pages";
var MAX_SCENE_BYTES = 512 * 1024;
var MAX_ELEMENTS = 2e3;
var MAX_ELEMENT_BYTES = 16 * 1024;
var MAX_TEXT_CHARS = 4e3;
var NAME_RE = /^[\w\u4e00-\u9fa5][\w\u4e00-\u9fa5 -]{0,63}$/;
var VERSIONS_DIR = ".versions";
var MAX_VERSIONS = 30;
var CLIENT_ARCHIVE_INTERVAL_MS = 10 * 6e4;
var WRITE_QUEUES = /* @__PURE__ */ new Map();
var BOARD_REVEALS = /* @__PURE__ */ new Map();
var BOARD_REVIEWS = /* @__PURE__ */ new Map();
var revealCounter = 0;
var ALLOWED_TYPES = /* @__PURE__ */ new Set([
  "rectangle",
  "diamond",
  "ellipse",
  "arrow",
  "line",
  "freedraw",
  "text",
  "image",
  "frame",
  "embeddable"
]);
var SEMANTIC_PALETTE = {
  primary: { stroke: "#4c6ef5", background: "#dbe4ff" },
  success: { stroke: "#40c057", background: "#d3f9d8" },
  warning: { stroke: "#fab005", background: "#fff3bf" },
  danger: { stroke: "#fa5252", background: "#ffe3e3" },
  info: { stroke: "#7950f2", background: "#e5dbff" },
  neutral: { stroke: "#868e96", background: "#f1f3f5" }
};
var SEMANTIC_COLOR_TYPES = /* @__PURE__ */ new Set(["rectangle", "diamond", "ellipse"]);
var CENTERED_TEXT_ROLES = /* @__PURE__ */ new Set([
  "button",
  "primary-button",
  "secondary-button",
  "danger-button",
  "destructive-button",
  "primary-action",
  "secondary-action",
  "chip",
  "filter-chip",
  "choice-chip",
  "tab",
  "tab-item",
  "navigation-item",
  "bottom-navigation-item",
  "bottom-nav-item",
  "segmented-control-item"
]);
var LEFT_MIDDLE_TEXT_ROLES = /* @__PURE__ */ new Set([
  "input",
  "text-input",
  "select",
  "dropdown",
  "search-input",
  "search-field"
]);
var BOTTOM_NAVIGATION_ROLES = /* @__PURE__ */ new Set(["bottom-navigation", "bottom-nav", "tabbar"]);
var BOTTOM_NAVIGATION_ITEM_ROLES = /* @__PURE__ */ new Set(["bottom-navigation-item", "bottom-nav-item"]);
function semanticTextAlignment(role3) {
  if (CENTERED_TEXT_ROLES.has(role3)) return { textAlign: "center", verticalAlign: "middle" };
  if (LEFT_MIDDLE_TEXT_ROLES.has(role3)) return { textAlign: "left", verticalAlign: "middle" };
  return null;
}
function semanticRole(element) {
  if (typeof element?.customData !== "object" || element.customData === null) return "";
  const role3 = element.customData.role;
  return typeof role3 === "string" ? role3.toLowerCase() : "";
}
function semanticTextGeometry(element, container, alignment) {
  if (container === void 0 || alignment.verticalAlign !== "middle") return { ...element, ...alignment };
  const fontSize = typeof element.fontSize === "number" && Number.isFinite(element.fontSize) ? element.fontSize : 20;
  const lineHeight = typeof element.lineHeight === "number" && Number.isFinite(element.lineHeight) ? element.lineHeight : 1.25;
  const text3 = typeof element.text === "string" ? element.text : "";
  const lines = text3 === "" ? 1 : text3.split("\n").length;
  const containerY = typeof container.y === "number" && Number.isFinite(container.y) ? container.y : 0;
  const containerHeight = typeof container.height === "number" && Number.isFinite(container.height) ? container.height : 0;
  const height = Math.min(containerHeight, lines * fontSize * lineHeight);
  return {
    ...element,
    ...alignment,
    y: containerY + (containerHeight - height) / 2,
    height
  };
}
var VERSION_FILE_RE = /^(\d{9,})-[0-9a-z]{1,8}\.json$/;
function versionStamp(entry) {
  const match = VERSION_FILE_RE.exec(entry);
  return match === null ? null : Number(match[1]);
}
function err(code, message) {
  return { ok: false, error: { code, message } };
}
function randomSeed() {
  return Math.floor(Math.random() * 2 ** 31) + 1;
}
function normalizeForPrefix(value) {
  return value.replaceAll("\\", "/").replace(/\/+$/, "");
}
function isPathInside(root, child) {
  if (root === "" || child === "") return false;
  const normRoot = normalizeForPrefix(root);
  const normChild = normalizeForPrefix(child);
  if (normChild === normRoot) return true;
  return normChild.startsWith(`${normRoot}/`);
}
function containingFrameId(frames, el) {
  const x1 = Number(el.x ?? 0);
  const y1 = Number(el.y ?? 0);
  const x2 = x1 + Number(el.width ?? 0);
  const y2 = y1 + Number(el.height ?? 0);
  for (const frame of frames) {
    const fx1 = Number(frame.x ?? 0);
    const fy1 = Number(frame.y ?? 0);
    const fx2 = fx1 + Number(frame.width ?? 0);
    const fy2 = fy1 + Number(frame.height ?? 0);
    if (x1 >= fx1 - 2 && y1 >= fy1 - 2 && x2 <= fx2 + 2 && y2 <= fy2 + 2) {
      return String(frame.id);
    }
  }
  return null;
}
function normalizeElement(input) {
  if (typeof input !== "object" || input === null) throw new Error("element must be an object");
  const el = input;
  const type = typeof el.type === "string" ? el.type : "";
  if (!ALLOWED_TYPES.has(type)) {
    throw new Error(`element type "${type}" is not allowed (use one of ${[...ALLOWED_TYPES].join(", ")})`);
  }
  const id = typeof el.id === "string" && el.id !== "" ? el.id : null;
  if (id === null || id.length > 64) throw new Error("element.id must be a non-empty string (<=64 chars)");
  const num4 = (v, d) => typeof v === "number" && Number.isFinite(v) ? v : d;
  const str4 = (v, d) => typeof v === "string" ? v : d;
  const text3 = str4(el.text, "").slice(0, MAX_TEXT_CHARS);
  const now2 = Date.now();
  const authoredCustomData = typeof el.customData === "object" && el.customData !== null ? el.customData : {};
  const role3 = str4(authoredCustomData.role, "").toLowerCase();
  const explicitTone = str4(authoredCustomData.tone, "").toLowerCase();
  const inferredTone = explicitTone !== "" ? explicitTone : role3 === "primary-action" || role3 === "primary-button" ? "primary" : role3 === "success" || role3 === "completed" ? "success" : role3 === "warning" ? "warning" : role3 === "danger" || role3 === "error" || role3 === "overdue" ? "danger" : "";
  const semanticColor = SEMANTIC_COLOR_TYPES.has(type) ? SEMANTIC_PALETTE[inferredTone] : void 0;
  const out = {
    id,
    type,
    x: num4(el.x, 0),
    y: num4(el.y, 0),
    width: num4(el.width, type === "text" ? 160 : 180),
    height: num4(el.height, type === "text" ? 80 : type === "frame" ? 320 : 80),
    angle: num4(el.angle, 0),
    strokeColor: str4(el.strokeColor, semanticColor?.stroke ?? "#1e1e1e"),
    backgroundColor: str4(el.backgroundColor, semanticColor?.background ?? "transparent"),
    fillStyle: str4(el.fillStyle, "solid"),
    strokeWidth: num4(el.strokeWidth, 1),
    strokeStyle: str4(el.strokeStyle, "solid"),
    roughness: num4(el.roughness, 1),
    opacity: num4(el.opacity, 100),
    groupIds: Array.isArray(el.groupIds) ? el.groupIds : [],
    frameId: el.frameId === void 0 || el.frameId === null ? null : el.frameId,
    roundness: el.roundness === void 0 || el.roundness === null ? type === "line" || type === "arrow" ? { type: 2 } : null : el.roundness,
    boundElements: Array.isArray(el.boundElements) ? el.boundElements : null,
    locked: el.locked === true,
    // Preserve links created by the user or authored by the agent. Invalid
    // values are discarded, but a valid Excalidraw link must survive a
    // client round-trip through normalizeScene().
    link: typeof el.link === "string" ? el.link : null,
    updated: now2,
    seed: num4(el.seed, randomSeed()),
    version: num4(el.version, 1),
    versionNonce: num4(el.versionNonce, randomSeed()),
    isDeleted: false
  };
  if (type === "text") {
    const fontSize = num4(el.fontSize, 20);
    const lines = text3 === "" ? 1 : text3.split("\n").length;
    out.text = text3;
    out.originalText = text3;
    out.fontSize = fontSize;
    out.fontFamily = num4(el.fontFamily, 1);
    out.textAlign = str4(el.textAlign, "left");
    out.verticalAlign = str4(el.verticalAlign, "top");
    out.containerId = el.containerId === void 0 || el.containerId === null ? null : el.containerId;
    out.lineHeight = num4(el.lineHeight, 1.25);
    out.autoResize = el.autoResize !== false;
    if (el.width === void 0) out.width = num4(el.width, Math.min(360, fontSize * (text3.length || 8) * 0.62 + 16));
    if (el.height === void 0) out.height = num4(el.height, lines * fontSize * 1.25 + 8);
  }
  if (type === "line" || type === "arrow") {
    const points = Array.isArray(el.points) && el.points.length > 0 ? el.points : [[0, 0], [num4(el.width, 160) - num4(el.x, 0), 0]];
    out.points = points;
    const xs = points.map((p) => p[0]);
    const ys = points.map((p) => p[1]);
    out.width = num4(el.width, Math.max(...xs) - Math.min(...xs));
    out.height = num4(el.height, Math.max(...ys) - Math.min(...ys));
    out.lastCommittedPoint = Array.isArray(el.lastCommittedPoint) ? el.lastCommittedPoint : null;
    out.startBinding = typeof el.startBinding === "object" && el.startBinding !== null ? el.startBinding : null;
    out.endBinding = typeof el.endBinding === "object" && el.endBinding !== null ? el.endBinding : null;
    out.startArrowhead = el.startArrowhead === null || typeof el.startArrowhead === "string" ? el.startArrowhead : null;
    out.endArrowhead = el.endArrowhead === null || typeof el.endArrowhead === "string" ? el.endArrowhead : null;
  }
  if (type === "frame") {
    const frameName = str4(el.name, "").trim();
    out.name = frameName !== "" ? frameName : text3;
  }
  for (const [key, value] of Object.entries(el)) {
    if (!(key in out)) out[key] = value;
  }
  if (Buffer.byteLength(JSON.stringify(out), "utf8") > MAX_ELEMENT_BYTES) {
    throw new Error(`element ${id} exceeds ${MAX_ELEMENT_BYTES} bytes`);
  }
  return out;
}
function reconcileBoundTextBindings(elements, alignmentFocusIds) {
  const byId = new Map(elements.map((element) => [String(element.id ?? ""), element]));
  const textsByContainer = /* @__PURE__ */ new Map();
  const frameMembershipByText = /* @__PURE__ */ new Map();
  const detachedNavigationTextIds = /* @__PURE__ */ new Set();
  for (const element of elements) {
    if (element.type !== "text" || typeof element.containerId !== "string" || element.containerId === "") continue;
    const container = byId.get(element.containerId);
    const focused = alignmentFocusIds === void 0 || alignmentFocusIds.has(String(element.id ?? "")) || container !== void 0 && alignmentFocusIds.has(String(container.id ?? ""));
    if (focused && BOTTOM_NAVIGATION_ITEM_ROLES.has(semanticRole(element)) && BOTTOM_NAVIGATION_ROLES.has(semanticRole(container))) {
      detachedNavigationTextIds.add(String(element.id ?? ""));
    }
  }
  for (const element of elements) {
    if (element.type !== "text" || typeof element.containerId !== "string" || element.containerId === "") continue;
    if (detachedNavigationTextIds.has(String(element.id ?? ""))) continue;
    const container = byId.get(element.containerId);
    if (container === void 0) continue;
    if (container.type === "frame") {
      frameMembershipByText.set(String(element.id ?? ""), element.containerId);
      continue;
    }
    if (!SEMANTIC_COLOR_TYPES.has(String(container.type ?? ""))) continue;
    const texts = textsByContainer.get(element.containerId) ?? [];
    texts.push(element);
    textsByContainer.set(element.containerId, texts);
  }
  return elements.map((element) => {
    const frameMembership = frameMembershipByText.get(String(element.id ?? ""));
    if (frameMembership !== void 0) {
      return {
        ...element,
        containerId: null,
        frameId: typeof element.frameId === "string" && element.frameId !== "" ? element.frameId : frameMembership
      };
    }
    if (element.type === "text") {
      const container = typeof element.containerId === "string" ? byId.get(element.containerId) : void 0;
      const elementRole3 = semanticRole(element);
      const containerRole = semanticRole(container);
      const elementAlignment = semanticTextAlignment(elementRole3);
      const containerAlignment = semanticTextAlignment(containerRole);
      const role3 = elementAlignment !== null ? elementRole3 : containerRole;
      const isFocused2 = alignmentFocusIds === void 0 || alignmentFocusIds.has(String(element.id ?? "")) || container !== void 0 && alignmentFocusIds.has(String(container.id ?? ""));
      const alignment = elementAlignment ?? containerAlignment;
      if (isFocused2 && alignment !== null) {
        if (detachedNavigationTextIds.has(String(element.id ?? ""))) {
          return {
            ...semanticTextGeometry(element, container, alignment),
            containerId: null
          };
        }
        if (container !== void 0) return semanticTextGeometry(element, container, alignment);
        if (BOTTOM_NAVIGATION_ITEM_ROLES.has(role3)) {
          const navigationShell = elements.find((candidate) => {
            if (!SEMANTIC_COLOR_TYPES.has(String(candidate.type ?? "")) || !BOTTOM_NAVIGATION_ROLES.has(semanticRole(candidate))) return false;
            const x = Number(element.x ?? 0);
            const y = Number(element.y ?? 0);
            const width = Number(element.width ?? 0);
            const height = Number(element.height ?? 0);
            const shellX = Number(candidate.x ?? 0);
            const shellY = Number(candidate.y ?? 0);
            return x >= shellX - 2 && y >= shellY - 2 && x + width <= shellX + Number(candidate.width ?? 0) + 2 && y + height <= shellY + Number(candidate.height ?? 0) + 2;
          });
          if (navigationShell !== void 0) return semanticTextGeometry(element, navigationShell, alignment);
        }
        return { ...element, ...alignment };
      }
      return element;
    }
    if (!SEMANTIC_COLOR_TYPES.has(String(element.type ?? ""))) return element;
    const containerId = String(element.id ?? "");
    const texts = textsByContainer.get(containerId) ?? [];
    if (texts.length !== 1) return element;
    const textId = String(texts[0].id ?? "");
    const existing = Array.isArray(element.boundElements) ? element.boundElements.filter((binding) => {
      if (typeof binding !== "object" || binding === null) return true;
      return binding.type !== "text";
    }) : [];
    return {
      ...element,
      boundElements: [...existing, { type: "text", id: textId }]
    };
  });
}
function normalizeScene(input) {
  if (typeof input !== "object" || input === null) throw new Error("scene must be an object");
  const raw = input;
  if (!Array.isArray(raw.elements)) throw new Error("scene.elements must be an array");
  if (raw.elements.length > MAX_ELEMENTS) throw new Error(`scene has more than ${MAX_ELEMENTS} elements`);
  const appState = typeof raw.appState === "object" && raw.appState !== null ? raw.appState : {};
  return {
    type: "excalidraw",
    version: 2,
    source: "dsh-draw2code",
    // Excalidraw deletions arrive as isDeleted tombstones kept in the
    // elements array. They MUST be dropped here (physical deletion):
    // normalizeElement defaults isDeleted to false, so letting a tombstone
    // through silently resurrects the element on disk — the user's deletion
    // vanishes, then resurfaces on the next poll, and re-deleting it is
    // swallowed by the client's echo guard (identical JSON). Filtering here
    // makes deletion physical and keeps client/server in agreement.
    elements: raw.elements.filter((el) => el.isDeleted !== true).map(normalizeElement),
    appState: {
      viewBackgroundColor: typeof appState.viewBackgroundColor === "string" ? appState.viewBackgroundColor : "#ffffff"
    }
  };
}
function capacityForNormalizedScene(scene) {
  const usedBytes = Buffer.byteLength(JSON.stringify(scene, null, 2), "utf8");
  return {
    maxBytes: MAX_SCENE_BYTES,
    usedBytes,
    remainingBytes: MAX_SCENE_BYTES - usedBytes,
    utilizationPercent: Math.round(usedBytes / MAX_SCENE_BYTES * 1e3) / 10
  };
}
function measureSceneCapacity(input) {
  return capacityForNormalizedScene(normalizeScene(input));
}
function emptyScene() {
  return {
    type: "excalidraw",
    version: 2,
    source: "dsh-draw2code",
    elements: [],
    appState: { viewBackgroundColor: "#ffffff" }
  };
}
function typeName(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "object") return "object";
  if (typeof value === "string") return `string(${value.length} chars)`;
  return typeof value;
}
function parseOps(input) {
  let source = input;
  if (typeof source === "string") {
    try {
      source = JSON.parse(source);
    } catch (error2) {
      throw new Error(`ops is not valid JSON: ${error2 instanceof Error ? error2.message : String(error2)}. Send an array like [{"op":"upsert","element":{...}}] or a JSON string encoding it`);
    }
  }
  if (!Array.isArray(source)) {
    throw new Error(`ops must be an array, got ${typeName(source)}. Large payloads sometimes arrive as a JSON string (auto-parsed); if you still see this, check the ops argument is an array of op objects`);
  }
  if (source.length > MAX_ELEMENTS) throw new Error(`ops has ${source.length} entries (max ${MAX_ELEMENTS})`);
  return source.map((raw, index) => {
    const where = `ops[${index}]`;
    if (typeof raw !== "object" || raw === null) throw new Error(`${where} must be an object, got ${typeName(raw)}`);
    const op = raw;
    const kind = op.op;
    if (kind === "upsert") {
      if (typeof op.element !== "object" || op.element === null) {
        throw new Error(`${where} is "upsert" but missing its element: use {"op":"upsert","element":{"id":"x","type":"rectangle",...}}`);
      }
      const el = op.element;
      if (typeof el.id !== "string" || el.id === "") {
        throw new Error(`${where}.element.id missing or not a string: every element needs a unique non-empty id`);
      }
      if (typeof el.type !== "string") {
        throw new Error(`${where}.element.type missing: pick one of rectangle | diamond | ellipse | arrow | line | freedraw | text | frame`);
      }
      return { op: "upsert", element: el };
    }
    if (kind === "delete") {
      const id = typeof op.id === "string" ? op.id : typeof op.elementId === "string" ? op.elementId : "";
      if (id === "") throw new Error(`${where} is "delete" but missing its id: use {"op":"delete","id":"<element id>"}`);
      return { op: "delete", id };
    }
    if (kind === "clear") return { op: "clear" };
    if (kind === "replace") {
      if (typeof op.scene !== "object" || op.scene === null) {
        throw new Error(`${where} is "replace" but missing its scene: use {"op":"replace","scene":{"elements":[...]}}`);
      }
      return { op: "replace", scene: op.scene };
    }
    throw new Error(`${where}.op = "${String(kind)}" is invalid: must be one of upsert | delete | clear | replace. The most common mistake is forgetting the op field entirely`);
  });
}
var SceneStore = class {
  constructor(ctx) {
    this.ctx = ctx;
  }
  /** Gate a requested root: must resolve on disk and sit inside a registered workspace. */
  async gate(root) {
    if (typeof root !== "string" || root === "") return err("workspace-unknown", "empty project root");
    let canonical;
    try {
      canonical = await realpath(root);
    } catch {
      return err("workspace-unknown", "path does not resolve on disk");
    }
    const workspaces = this.ctx.workspaceRegistry.list();
    for (const workspace of workspaces) {
      if (isPathInside(workspace.path, canonical)) return { ok: true, value: canonical };
    }
    return err("workspace-unknown", "path is not inside a registered workspace");
  }
  /** The draw2code directory for a gated root (created lazily on write). */
  dir(canonicalRoot) {
    return join(canonicalRoot, SCENE_DIR);
  }
  activeBoardPath(canonicalRoot) {
    return join(this.dir(canonicalRoot), ACTIVE_BOARD_FILE);
  }
  /** Validate a scene name. */
  checkName(name) {
    const trimmed = typeof name === "string" ? name.trim() : "";
    if (!NAME_RE.test(trimmed)) {
      return err("bad-name", `scene name "${name}" is invalid (1-64 chars of letters/digits/_/-/space/CJK, no extension)`);
    }
    return { ok: true, value: trimmed };
  }
  async scenePath(canonicalRoot, name) {
    return join(this.dir(canonicalRoot), `${name}.excalidraw.json`);
  }
  async withWriteLock(path, task) {
    const previous = WRITE_QUEUES.get(path) ?? Promise.resolve();
    let release = () => void 0;
    const current = new Promise((resolve4) => {
      release = resolve4;
    });
    const tail = previous.catch(() => void 0).then(() => current);
    WRITE_QUEUES.set(path, tail);
    await previous.catch(() => void 0);
    try {
      return await task();
    } finally {
      release();
      if (WRITE_QUEUES.get(path) === tail) WRITE_QUEUES.delete(path);
    }
  }
  /** Read the board selected by the browser, without making it a scene. */
  async getActiveBoard(root) {
    const gated = await this.gate(root);
    if (!gated.ok) return gated;
    let raw;
    try {
      raw = await readFile(this.activeBoardPath(gated.value), "utf8");
    } catch {
      return { ok: true, value: { name: null } };
    }
    try {
      const parsed = JSON.parse(raw);
      const named = this.checkName(parsed.name);
      return named.ok ? { ok: true, value: { name: named.value } } : { ok: true, value: { name: null } };
    } catch {
      return { ok: true, value: { name: null } };
    }
  }
  /** Persist the browser's selected board for agent tools in this workspace. */
  async setActiveBoard(root, name) {
    const gated = await this.gate(root);
    if (!gated.ok) return gated;
    const named = this.checkName(name);
    if (!named.ok) return named;
    await mkdir(this.dir(gated.value), { recursive: true });
    const path = this.activeBoardPath(gated.value);
    return this.withWriteLock(path, async () => {
      const tmp = `${path}.tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      await writeFile2(tmp, `${JSON.stringify({ name: named.value })}
`, "utf8");
      await rename(tmp, path);
      return { ok: true, value: { name: named.value } };
    });
  }
  /** Publish the latest verified update for the browser-side auto-open loop. */
  async publishBoardReveal(root, name, revision) {
    const gated = await this.gate(root);
    if (!gated.ok) return gated;
    const named = this.checkName(name);
    if (!named.ok) return named;
    revealCounter += 1;
    const request = {
      id: `reveal-${Date.now().toString(36)}-${revealCounter.toString(36)}`,
      board: named.value,
      revision,
      createdAt: Date.now()
    };
    BOARD_REVEALS.set(gated.value, request);
    return { ok: true, value: request };
  }
  /** Read the latest reveal request; clients de-duplicate it by id. */
  async getBoardReveal(root) {
    const gated = await this.gate(root);
    if (!gated.ok) return gated;
    return { ok: true, value: { request: BOARD_REVEALS.get(gated.value) ?? null } };
  }
  /** Record that the browser consumed the latest reveal and opened its tab. */
  async ackBoardReveal(root, id, board) {
    const gated = await this.gate(root);
    if (!gated.ok) return gated;
    const current = BOARD_REVEALS.get(gated.value);
    if (current === void 0 || current.id !== id || current.board !== board) {
      return err("stale-reveal", "reveal acknowledgement does not match the latest request");
    }
    const acknowledged = { ...current, consumedAt: current.consumedAt ?? Date.now() };
    BOARD_REVEALS.set(gated.value, acknowledged);
    return { ok: true, value: acknowledged };
  }
  /** Record a visible review of the latest reveal without writing the board. */
  async recordBoardReview(root, input) {
    const gated = await this.gate(root);
    if (!gated.ok) return gated;
    const named = this.checkName(input.board);
    if (!named.ok) return named;
    const current = BOARD_REVEALS.get(gated.value);
    if (current === void 0 || current.id !== input.token || current.board !== named.value) {
      return err("visual-review-stale", "review token does not match the latest visible-board reveal");
    }
    if (Math.abs(current.revision - input.boardRevision) > 0.5) {
      return err("visual-review-stale", `review token revision ${current.revision} does not match current board revision ${input.boardRevision}`);
    }
    if (typeof current.consumedAt !== "number") {
      return err("visual-review-not-visible", "the canvas has not acknowledged opening this review token");
    }
    const key = `${gated.value}\0${named.value}\0${input.phase}`;
    const existing = BOARD_REVIEWS.get(key);
    if (existing?.token === input.token) return { ok: true, value: existing };
    const { boardRevision, ...reviewInput } = input;
    const receipt = {
      ...reviewInput,
      board: named.value,
      revision: boardRevision,
      inspectedPageIds: [...input.inspectedPageIds],
      observations: [...input.observations],
      reviewedAt: Date.now()
    };
    BOARD_REVIEWS.set(key, receipt);
    return { ok: true, value: receipt };
  }
  /** Read the latest stored review for one board and phase. */
  async getBoardReview(root, board, phase) {
    const gated = await this.gate(root);
    if (!gated.ok) return gated;
    const named = this.checkName(board);
    if (!named.ok) return named;
    const key = `${gated.value}\0${named.value}\0${phase}`;
    return { ok: true, value: { receipt: BOARD_REVIEWS.get(key) ?? null } };
  }
  /** The versions directory of one board (inside draw2code/.versions/<name>). */
  versionsDir(canonicalRoot, name) {
    return join(this.dir(canonicalRoot), VERSIONS_DIR, name);
  }
  /**
   * Snapshot the CURRENT disk scene of a board before it gets overwritten.
   * Skipped when the scene file is absent, when the incoming content is
   * byte-identical, or (client throttling) when the newest snapshot of the
   * board is younger than CLIENT_ARCHIVE_INTERVAL_MS. Prunes to MAX_VERSIONS.
   */
  async archiveCurrent(canonicalRoot, name, incomingJson, always) {
    const scenePath = await this.scenePath(canonicalRoot, name);
    let raw;
    try {
      const info = await stat(scenePath);
      if (!info.isFile()) return;
      raw = await readFile(scenePath, "utf8");
    } catch {
      return;
    }
    const currentJson = JSON.stringify(JSON.parse(raw));
    if (currentJson === JSON.stringify(JSON.parse(incomingJson))) return;
    const dir = this.versionsDir(canonicalRoot, name);
    let entries = [];
    try {
      entries = (await readdir(dir)).filter((entry) => versionStamp(entry) !== null);
    } catch {
    }
    if (!always && entries.length > 0) {
      const stamps = entries.map((entry) => versionStamp(entry) ?? 0);
      const newest = Math.max(...stamps);
      if (Date.now() - newest < CLIENT_ARCHIVE_INTERVAL_MS) return;
    }
    try {
      await mkdir(dir, { recursive: true });
      const suffix = Math.random().toString(36).slice(2, 8).padEnd(6, "0");
      await writeFile2(join(dir, `${Date.now()}-${suffix}.json`), `${raw}
`, "utf8");
      if (entries.length + 1 > MAX_VERSIONS) {
        const doomed = entries.map((entry) => ({ entry, stamp: versionStamp(entry) ?? 0 })).sort((a, b) => a.stamp - b.stamp).slice(0, entries.length + 1 - MAX_VERSIONS);
        await Promise.all(doomed.map(({ entry }) => rm(join(dir, entry), { force: true }).catch(() => void 0)));
      }
    } catch (error2) {
      this.ctx.logger.warn("draw2code version snapshot failed: %o", error2);
    }
  }
  /** List the archived versions of a board (newest first, empty when none). */
  async listVersions(root, name) {
    const gated = await this.gate(root);
    if (!gated.ok) return gated;
    const named = this.checkName(name);
    if (!named.ok) return named;
    const dir = this.versionsDir(gated.value, named.value);
    let entries;
    try {
      entries = await readdir(dir);
    } catch {
      return { ok: true, value: [] };
    }
    const versions = [];
    for (const entry of entries) {
      const stamp = versionStamp(entry);
      if (stamp === null) continue;
      try {
        const raw = await readFile(join(dir, entry), "utf8");
        const elements = JSON.parse(raw).elements;
        versions.push({
          id: entry.slice(0, -".json".length),
          ts: stamp,
          elementCount: Array.isArray(elements) ? elements.length : 0
        });
      } catch {
      }
    }
    versions.sort((a, b) => b.ts - a.ts);
    return { ok: true, value: versions };
  }
  /** Read one archived version without changing the current board. */
  async readVersion(root, name, id) {
    const gated = await this.gate(root);
    if (!gated.ok) return gated;
    const named = this.checkName(name);
    if (!named.ok) return named;
    if (!/^\d{9,}-[0-9a-z]{1,8}$/.test(id)) return err("bad-version", `version id "${id}" is invalid`);
    let raw;
    try {
      raw = await readFile(join(this.versionsDir(gated.value, named.value), `${id}.json`), "utf8");
    } catch {
      return err("not-found", `version ${id} of scene "${named.value}" does not exist`);
    }
    if (Buffer.byteLength(raw) > MAX_SCENE_BYTES * 4) {
      return err("too-large", `version ${id} of scene "${named.value}" exceeds the read cap`);
    }
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return err("corrupt", `version ${id} of scene "${named.value}" is not valid JSON`);
    }
    const elements = parsed.elements;
    const scene = {
      type: "excalidraw",
      version: 2,
      source: "dsh-draw2code",
      elements: Array.isArray(elements) ? elements : [],
      appState: {
        viewBackgroundColor: typeof parsed.appState?.viewBackgroundColor === "string" ? parsed.appState.viewBackgroundColor : "#ffffff"
      }
    };
    return { ok: true, value: { id, ts: Number(id.split("-", 1)[0]), elementCount: scene.elements.length, scene } };
  }
  /** Roll a board back to one archived version (snapshotting the current
   * state first, so the rollback itself is reversible). */
  async restoreVersion(root, name, id) {
    const version2 = await this.readVersion(root, name, id);
    if (!version2.ok) return version2;
    return this.write(root, name, version2.value.scene, void 0, "agent");
  }
  /**
   * Inventory the generated-pages output directory of a board
   * (draw2code-pages/<board>/, empty when absent) — the style-continuation
   * basis for draw2code_generate.
   */
  async existingPages(root, name) {
    const gated = await this.gate(root);
    if (!gated.ok) return gated;
    const named = this.checkName(name);
    if (!named.ok) return named;
    const dir = join(gated.value, PAGES_DIR, named.value);
    let entries;
    try {
      entries = await readdir(dir);
    } catch {
      return { ok: true, value: [] };
    }
    const files = [];
    for (const entry of entries) {
      try {
        const info = await stat(join(dir, entry));
        if (info.isFile()) files.push(entry);
      } catch {
      }
    }
    files.sort();
    return { ok: true, value: files };
  }
  /** Read one resumable generate session kept beside, but separate from, scenes. */
  async readGeneration(root, sessionId) {
    const gated = await this.gate(root);
    if (!gated.ok) return gated;
    if (!GENERATION_ID_RE.test(sessionId)) return err("bad-generation-id", `generation id "${sessionId}" is invalid`);
    try {
      const raw = await readFile(join(this.dir(gated.value), GENERATIONS_DIR, `${sessionId}.json`), "utf8");
      return { ok: true, value: JSON.parse(raw) };
    } catch {
      return err("not-found", `generation "${sessionId}" does not exist`);
    }
  }
  /** Atomically persist one generate session so interruption never loses choices. */
  async writeGeneration(root, sessionId, draft) {
    const gated = await this.gate(root);
    if (!gated.ok) return gated;
    if (!GENERATION_ID_RE.test(sessionId)) return err("bad-generation-id", `generation id "${sessionId}" is invalid`);
    const dir = join(this.dir(gated.value), GENERATIONS_DIR);
    await mkdir(dir, { recursive: true });
    const path = join(dir, `${sessionId}.json`);
    const normalized = { ...draft, sessionId, updatedAt: Date.now() };
    const tmp = `${path}.tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await writeFile2(tmp, `${JSON.stringify(normalized, null, 2)}
`, "utf8");
    await rename(tmp, path);
    return { ok: true, value: normalized };
  }
  /** Project-level visual direction inherited by later generate sessions. */
  async readGenerateSettings(root, name) {
    const gated = await this.gate(root);
    if (!gated.ok) return gated;
    const named = this.checkName(name);
    if (!named.ok) return named;
    try {
      const raw = await readFile(join(this.dir(gated.value), GENERATE_SETTINGS_DIR, `${named.value}.json`), "utf8");
      return { ok: true, value: JSON.parse(raw) };
    } catch {
      return { ok: true, value: null };
    }
  }
  async writeGenerateSettings(root, name, settings) {
    const gated = await this.gate(root);
    if (!gated.ok) return gated;
    const named = this.checkName(name);
    if (!named.ok) return named;
    const dir = join(this.dir(gated.value), GENERATE_SETTINGS_DIR);
    await mkdir(dir, { recursive: true });
    const path = join(dir, `${named.value}.json`);
    const normalized = { ...settings, board: named.value, updatedAt: Date.now() };
    const tmp = `${path}.tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await writeFile2(tmp, `${JSON.stringify(normalized, null, 2)}
`, "utf8");
    await rename(tmp, path);
    return { ok: true, value: normalized };
  }
  /** List every scene under a root (empty list when the directory is absent). */
  async list(root) {
    const gated = await this.gate(root);
    if (!gated.ok) return gated;
    let entries;
    try {
      entries = await readdir(this.dir(gated.value));
    } catch {
      return { ok: true, value: [] };
    }
    const metas = [];
    for (const entry of entries) {
      if (!entry.endsWith(".excalidraw.json")) continue;
      const name = entry.slice(0, -".excalidraw.json".length);
      const path = join(this.dir(gated.value), entry);
      try {
        const info = await stat(path);
        if (!info.isFile()) continue;
        const raw = await readFile(path, "utf8");
        const parsed = JSON.parse(raw);
        const elements = parsed.elements;
        metas.push({
          name,
          rev: info.mtimeMs,
          updatedAt: info.mtimeMs,
          elementCount: Array.isArray(elements) ? elements.length : 0
        });
      } catch {
      }
    }
    metas.sort((a, b) => b.updatedAt - a.updatedAt);
    return { ok: true, value: metas };
  }
  /** Read one scene. */
  async read(root, name) {
    const gated = await this.gate(root);
    if (!gated.ok) return gated;
    const named = this.checkName(name);
    if (!named.ok) return named;
    const path = await this.scenePath(gated.value, named.value);
    let raw;
    let rev;
    try {
      const info = await stat(path);
      rev = info.mtimeMs;
      raw = await readFile(path, "utf8");
    } catch {
      return err("not-found", `scene "${named.value}" does not exist`);
    }
    if (Buffer.byteLength(raw) > MAX_SCENE_BYTES * 4) {
      return err("too-large", `scene "${named.value}" exceeds the read cap`);
    }
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return err("corrupt", `scene "${named.value}" is not valid JSON`);
    }
    const elements = parsed.elements;
    const scene = {
      type: "excalidraw",
      version: 2,
      source: "dsh-draw2code",
      elements: Array.isArray(elements) ? elements : [],
      appState: {
        viewBackgroundColor: typeof parsed.appState?.viewBackgroundColor === "string" ? parsed.appState.viewBackgroundColor : "#ffffff"
      }
    };
    return { ok: true, value: { rev, scene } };
  }
  /** Write a whole scene (validated). baseRev conflicts return 'conflict'. */
  async write(root, name, sceneInput, baseRev, archive = "client") {
    const gated = await this.gate(root);
    if (!gated.ok) return gated;
    const named = this.checkName(name);
    if (!named.ok) return named;
    let scene;
    try {
      scene = normalizeScene(sceneInput);
    } catch (error2) {
      return err("bad-scene", error2 instanceof Error ? error2.message : String(error2));
    }
    const json = JSON.stringify(scene, null, 2);
    if (Buffer.byteLength(json, "utf8") > MAX_SCENE_BYTES) {
      return err("too-large", `scene exceeds ${MAX_SCENE_BYTES} bytes`);
    }
    const path = await this.scenePath(gated.value, named.value);
    return this.withWriteLock(path, async () => {
      if (typeof baseRev === "number") {
        try {
          const info2 = await stat(path);
          if (Math.abs(info2.mtimeMs - baseRev) > 0.5) {
            return err("conflict", `scene changed on disk since rev ${baseRev}`);
          }
        } catch {
          if (baseRev !== 0) return err("conflict", `scene was deleted since rev ${baseRev}`);
        }
      }
      await mkdir(this.dir(gated.value), { recursive: true });
      await this.archiveCurrent(gated.value, named.value, json, archive === "agent");
      const tmp = `${path}.tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      await writeFile2(tmp, json + "\n", "utf8");
      await rename(tmp, path);
      const info = await stat(path);
      return {
        ok: true,
        value: { name: named.value, rev: info.mtimeMs, updatedAt: info.mtimeMs, elementCount: scene.elements.length }
      };
    });
  }
  /** Create an empty scene (fails when it already exists). */
  async create(root, name) {
    const read = await this.read(root, name);
    if (read.ok) return err("exists", `scene "${name}" already exists`);
    if (read.error.code !== "not-found") return read;
    const written = await this.write(root, name, emptyScene(), 0);
    return !written.ok && written.error.code === "conflict" ? err("exists", `scene "${name}" already exists`) : written;
  }
  /** Delete one scene. */
  async remove(root, name) {
    const gated = await this.gate(root);
    if (!gated.ok) return gated;
    const named = this.checkName(name);
    if (!named.ok) return named;
    const path = await this.scenePath(gated.value, named.value);
    return this.withWriteLock(path, async () => {
      try {
        await rm(path);
      } catch {
        return err("not-found", `scene "${name}" does not exist`);
      }
      await rm(this.versionsDir(gated.value, named.value), { recursive: true, force: true }).catch(() => void 0);
      const active = await this.getActiveBoard(root);
      if (active.ok && active.value.name === named.value) {
        const activePath = this.activeBoardPath(gated.value);
        await this.withWriteLock(activePath, async () => {
          const latest = await this.getActiveBoard(root);
          if (latest.ok && latest.value.name === named.value) await rm(activePath, { force: true });
        });
      }
      BOARD_REVEALS.delete(gated.value);
      BOARD_REVIEWS.delete(`${gated.value}\0${named.value}\0representative`);
      BOARD_REVIEWS.delete(`${gated.value}\0${named.value}\0final`);
      return { ok: true, value: { deleted: true } };
    });
  }
  /**
   * Apply an ops array against a scene (auto-creating an empty scene when it
   * does not exist yet) — the agent-side mutation path. Upserts normalize
   * their element, so partial authored fields are filled.
   */
  async applyOps(root, name, opsInput, baseRev) {
    let ops;
    try {
      ops = parseOps(opsInput);
    } catch (error2) {
      return err("bad-ops", error2 instanceof Error ? error2.message : String(error2));
    }
    const current = await this.read(root, name);
    let scene;
    if (current.ok) {
      scene = current.value.scene;
    } else if (current.error.code === "not-found") {
      scene = emptyScene();
    } else {
      return current;
    }
    const expectedBaseRev = typeof baseRev === "number" ? baseRev : current.ok ? current.value.rev : 0;
    let applied = 0;
    const alignmentFocusIds = /* @__PURE__ */ new Set();
    let alignWholeScene = false;
    for (const op of ops) {
      if (op.op === "replace") {
        try {
          scene = normalizeScene(op.scene);
        } catch (error2) {
          return err("bad-scene", error2 instanceof Error ? error2.message : String(error2));
        }
        alignWholeScene = true;
        applied += 1;
        continue;
      }
      if (op.op === "clear") {
        scene = { ...scene, elements: [] };
        applied += 1;
        continue;
      }
      if (op.op === "delete") {
        const before = scene.elements.length;
        scene = { ...scene, elements: scene.elements.filter((el) => el.id !== op.id) };
        if (scene.elements.length !== before) applied += 1;
        continue;
      }
      alignmentFocusIds.add(String(op.element.id ?? ""));
      let normalized;
      try {
        normalized = normalizeElement(op.element);
      } catch (error2) {
        return err("bad-element", error2 instanceof Error ? error2.message : String(error2));
      }
      if (normalized.frameId === null || normalized.frameId === void 0) {
        const frames = scene.elements.filter((el) => el.type === "frame");
        normalized.frameId = containingFrameId(frames, normalized);
      }
      const index = scene.elements.findIndex((el) => el.id === normalized.id);
      if (index === -1) {
        scene = { ...scene, elements: [...scene.elements, normalized] };
      } else {
        const elements = scene.elements.slice();
        elements[index] = normalized;
        scene = { ...scene, elements };
      }
      applied += 1;
    }
    if (scene.elements.length > MAX_ELEMENTS) {
      return err("too-many", `scene would exceed ${MAX_ELEMENTS} elements`);
    }
    scene = {
      ...scene,
      elements: reconcileBoundTextBindings(
        scene.elements,
        alignWholeScene ? void 0 : alignmentFocusIds
      )
    };
    const written = await this.write(root, name, scene, expectedBaseRev, "agent");
    if (!written.ok) return written;
    return { ok: true, value: { ...written.value, applied } };
  }
};

// src/runtime.ts
import { randomBytes } from "node:crypto";
import { mkdir as mkdir3, readFile as readFile3, realpath as realpath4, rename as rename3, stat as stat3, writeFile as writeFile4 } from "node:fs/promises";
import { dirname } from "node:path";

// src/project-store.ts
import { randomUUID } from "node:crypto";
import { mkdir as mkdir2, readFile as readFile2, readdir as readdir2, rename as rename2, stat as stat2, writeFile as writeFile3 } from "node:fs/promises";
import { realpath as realpath2 } from "node:fs/promises";
import { join as join2 } from "node:path";
var PROJECTS_DIR = `${SCENE_DIR}/.projects`;
var PROJECT_ID_RE = /^project-[0-9a-f-]{36}$/;
var PROJECT_FILE_RE = /^project-[0-9a-f-]{36}\.json$/;
var VERSION_FILE_RE2 = /^(\d{9,})-[0-9a-z]{1,8}\.json$/;
function error(code, message, current) {
  return { ok: false, error: { code, message, ...current === void 0 ? {} : { current } } };
}
function now() {
  return Date.now();
}
function validateProjectId(projectId) {
  return PROJECT_ID_RE.test(projectId) ? { ok: true, value: projectId } : error("bad-project-id", `project id "${projectId}" is invalid`);
}
function versionStamp2(entry) {
  const match = VERSION_FILE_RE2.exec(entry);
  return match === null ? null : Number(match[1]);
}
function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
function newProjectId() {
  return `project-${randomUUID()}`;
}
var PROJECT_MUTATION_QUEUES = /* @__PURE__ */ new Map();
var ProjectStore = class {
  constructor(ctx) {
    this.ctx = ctx;
  }
  async withMutationLock(path, task) {
    const previous = PROJECT_MUTATION_QUEUES.get(path) ?? Promise.resolve();
    let release = () => void 0;
    const current = new Promise((resolve4) => {
      release = resolve4;
    });
    const tail = previous.catch(() => void 0).then(() => current);
    PROJECT_MUTATION_QUEUES.set(path, tail);
    await previous.catch(() => void 0);
    try {
      return await task();
    } finally {
      release();
      if (PROJECT_MUTATION_QUEUES.get(path) === tail) PROJECT_MUTATION_QUEUES.delete(path);
    }
  }
  async gate(root) {
    if (typeof root !== "string" || root === "") return error("workspace-unknown", "empty project root");
    let canonical;
    try {
      canonical = await realpath2(root);
    } catch {
      return error("workspace-unknown", "path does not resolve on disk");
    }
    const workspaces = this.ctx.workspaceRegistry.list();
    for (const workspace of workspaces) {
      if (isPathInside(workspace.path, canonical)) return { ok: true, value: canonical };
    }
    return error("workspace-unknown", "path is not inside a registered workspace");
  }
  projectDir(root) {
    return join2(root, PROJECTS_DIR);
  }
  projectPath(root, projectId) {
    return join2(this.projectDir(root), `${projectId}.json`);
  }
  versionsDir(root, projectId) {
    return join2(this.projectDir(root), ".versions", projectId);
  }
  fileName(projectId) {
    return `${PROJECTS_DIR}/${projectId}.json`;
  }
  async read(root, projectId) {
    const gated = await this.gate(root);
    if (!gated.ok) return gated;
    const validId = validateProjectId(projectId);
    if (!validId.ok) return validId;
    let raw;
    try {
      raw = await readFile2(this.projectPath(gated.value, validId.value), "utf8");
    } catch {
      return error("not-found", `project "${projectId}" does not exist`);
    }
    try {
      return { ok: true, value: JSON.parse(raw) };
    } catch {
      return error("corrupt", `project "${projectId}" is not valid JSON`);
    }
  }
  async create(root, draft) {
    const gated = await this.gate(root);
    if (!gated.ok) return gated;
    const validId = validateProjectId(draft.projectId);
    if (!validId.ok) return validId;
    const path = this.projectPath(gated.value, validId.value);
    try {
      await stat2(path);
      return error("exists", `project "${draft.projectId}" already exists`);
    } catch {
    }
    await mkdir2(this.projectDir(gated.value), { recursive: true });
    const written = await this.writeAtomic(gated.value, draft);
    return written;
  }
  async save(root, draft, expectedRevision) {
    const gated = await this.gate(root);
    if (!gated.ok) return gated;
    const validId = validateProjectId(draft.projectId);
    if (!validId.ok) return validId;
    const path = this.projectPath(gated.value, validId.value);
    return this.withMutationLock(path, async () => {
      const current = await this.read(root, draft.projectId);
      if (!current.ok) return current;
      if (current.value.revision !== expectedRevision) {
        return error("stale_revision", `project changed since revision ${expectedRevision}`, current.value);
      }
      await this.archiveCurrent(gated.value, draft.projectId);
      return this.writeAtomic(gated.value, draft);
    });
  }
  async list(root) {
    const gated = await this.gate(root);
    if (!gated.ok) return gated;
    let entries;
    try {
      entries = await readdir2(this.projectDir(gated.value));
    } catch {
      return { ok: true, value: [] };
    }
    const drafts = [];
    for (const entry of entries) {
      if (!PROJECT_FILE_RE.test(entry)) continue;
      try {
        drafts.push(JSON.parse(await readFile2(join2(this.projectDir(gated.value), entry), "utf8")));
      } catch {
      }
    }
    drafts.sort((a, b) => b.updatedAt - a.updatedAt);
    return { ok: true, value: drafts };
  }
  async writeAtomic(root, draft) {
    const normalized = clone({ ...draft, updatedAt: now() });
    await mkdir2(this.projectDir(root), { recursive: true });
    const path = this.projectPath(root, draft.projectId);
    const tmp = `${path}.tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await writeFile3(tmp, `${JSON.stringify(normalized, null, 2)}
`, "utf8");
    await rename2(tmp, path);
    return { ok: true, value: normalized };
  }
  async archiveCurrent(root, projectId) {
    const path = this.projectPath(root, projectId);
    let raw;
    try {
      raw = await readFile2(path, "utf8");
    } catch {
      return;
    }
    const dir = this.versionsDir(root, projectId);
    await mkdir2(dir, { recursive: true });
    const suffix = Math.random().toString(36).slice(2, 8).padEnd(6, "0");
    await writeFile3(join2(dir, `${Date.now()}-${suffix}.json`), `${raw}
`, "utf8");
    const entries = (await readdir2(dir)).filter((entry) => versionStamp2(entry) !== null);
    if (entries.length <= 30) return;
    const doomed = entries.map((entry) => ({ entry, stamp: versionStamp2(entry) ?? 0 })).sort((a, b) => a.stamp - b.stamp).slice(0, entries.length - 30);
    const { rm: rm3 } = await import("node:fs/promises");
    await Promise.all(doomed.map(({ entry }) => rm3(join2(dir, entry), { force: true })));
  }
};

// src/store-context.ts
function storeContextFor(workspaceRoot) {
  return {
    workspaceRegistry: { list: () => [{ path: workspaceRoot }] },
    logger: { warn: (message, ...args) => console.warn(message, ...args) }
  };
}

// node_modules/@deepseek-ai/cosmokit/lib/index.js
function isNullable(value) {
  return value === null || value === void 0;
}
function isPlainObject(data) {
  return data && typeof data === "object" && !Array.isArray(data);
}
function filterKeys(object, filter) {
  return Object.fromEntries(Object.entries(object).filter(([key, value]) => filter(key, value)));
}
function mapValues(object, transform) {
  return Object.fromEntries(Object.entries(object).map(([key, value]) => [key, transform(value, key)]));
}
function pick(source, keys, forced) {
  if (!keys) return { ...source };
  const result = {};
  for (const key of keys) if (forced || source[key] !== void 0) result[key] = source[key];
  return result;
}
function defineProperty(object, key, value) {
  return Object.defineProperty(object, key, {
    writable: true,
    value,
    enumerable: false
  });
}
function is(type, value) {
  if (arguments.length === 1) return (value2) => is(type, value2);
  return type in globalThis && value instanceof globalThis[type] || Object.prototype.toString.call(value).slice(8, -1) === type;
}
function isArrayBufferLike(value) {
  return is("ArrayBuffer", value) || is("SharedArrayBuffer", value);
}
function isArrayBufferSource(value) {
  return isArrayBufferLike(value) || ArrayBuffer.isView(value);
}
var Binary;
(function(Binary2) {
  Binary2.is = isArrayBufferLike;
  Binary2.isSource = isArrayBufferSource;
  function fromSource(source) {
    if (ArrayBuffer.isView(source)) return source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
    else return source;
  }
  Binary2.fromSource = fromSource;
  function toBase64(source) {
    source = fromSource(source);
    if (typeof Buffer !== "undefined") return Buffer.from(source).toString("base64");
    let binary = "";
    const bytes = new Uint8Array(source);
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }
  Binary2.toBase64 = toBase64;
  function fromBase64(source) {
    if (typeof Buffer !== "undefined") return fromSource(Buffer.from(source, "base64"));
    return Uint8Array.from(atob(source), (c) => c.charCodeAt(0));
  }
  Binary2.fromBase64 = fromBase64;
  function toHex(source) {
    source = fromSource(source);
    if (typeof Buffer !== "undefined") return Buffer.from(source).toString("hex");
    return Array.from(new Uint8Array(source), (byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  Binary2.toHex = toHex;
  function fromHex(source) {
    if (typeof Buffer !== "undefined") return fromSource(Buffer.from(source, "hex"));
    const hex = source.length % 2 === 0 ? source : source.slice(0, source.length - 1);
    const buffer = [];
    for (let i = 0; i < hex.length; i += 2) buffer.push(parseInt(`${hex[i]}${hex[i + 1]}`, 16));
    return Uint8Array.from(buffer).buffer;
  }
  Binary2.fromHex = fromHex;
})(Binary || (Binary = {}));
var base64ToArrayBuffer = Binary.fromBase64;
var arrayBufferToBase64 = Binary.toBase64;
var hexToArrayBuffer = Binary.fromHex;
var arrayBufferToHex = Binary.toHex;
function clone2(source, refs = /* @__PURE__ */ new Map()) {
  if (!source || typeof source !== "object") return source;
  if (is("Date", source)) return new Date(source.valueOf());
  if (is("RegExp", source)) return new RegExp(source.source, source.flags);
  if (isArrayBufferLike(source)) return source.slice(0);
  if (ArrayBuffer.isView(source)) return source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
  const cached = refs.get(source);
  if (cached) return cached;
  if (Array.isArray(source)) {
    const result2 = [];
    refs.set(source, result2);
    source.forEach((value, index) => {
      result2[index] = Reflect.apply(clone2, null, [value, refs]);
    });
    return result2;
  }
  const result = Object.create(Object.getPrototypeOf(source));
  refs.set(source, result);
  for (const key of Reflect.ownKeys(source)) {
    const descriptor = { ...Reflect.getOwnPropertyDescriptor(source, key) };
    if ("value" in descriptor) descriptor.value = Reflect.apply(clone2, null, [descriptor.value, refs]);
    Reflect.defineProperty(result, key, descriptor);
  }
  return result;
}
function deepEqual(a, b, strict) {
  if (a === b) return true;
  if (!strict && isNullable(a) && isNullable(b)) return true;
  if (typeof a !== typeof b) return false;
  if (typeof a !== "object") return false;
  if (!a || !b) return false;
  function check(test, then) {
    return test(a) ? test(b) ? then(a, b) : false : test(b) ? false : void 0;
  }
  return check(Array.isArray, (a2, b2) => a2.length === b2.length && a2.every((item, index) => deepEqual(item, b2[index]))) ?? check(is("Date"), (a2, b2) => a2.valueOf() === b2.valueOf()) ?? check(is("RegExp"), (a2, b2) => a2.source === b2.source && a2.flags === b2.flags) ?? check(isArrayBufferLike, (a2, b2) => {
    if (a2.byteLength !== b2.byteLength) return false;
    const viewA = new Uint8Array(a2);
    const viewB = new Uint8Array(b2);
    for (let i = 0; i < viewA.length; i++) if (viewA[i] !== viewB[i]) return false;
    return true;
  }) ?? Object.keys({
    ...a,
    ...b
  }).every((key) => deepEqual(a[key], b[key], strict));
}
function tokenize(source, delimiters, delimiter) {
  const output = [];
  let state = 0;
  for (let i = 0; i < source.length; i++) {
    const code = source.charCodeAt(i);
    if (code >= 65 && code <= 90) {
      if (state === 1) {
        const next = source.charCodeAt(i + 1);
        if (next >= 97 && next <= 122) output.push(delimiter);
        output.push(code + 32);
      } else {
        if (state !== 0) output.push(delimiter);
        output.push(code + 32);
      }
      state = 1;
    } else if (code >= 97 && code <= 122) {
      output.push(code);
      state = 2;
    } else if (delimiters.includes(code)) {
      if (state !== 0) output.push(delimiter);
      state = 0;
    } else output.push(code);
  }
  return String.fromCharCode(...output);
}
function paramCase(source) {
  return tokenize(source, [45, 95], 45);
}
var hyphenate = paramCase;
var Time;
(function(Time2) {
  Time2.millisecond = 1;
  Time2.second = 1e3;
  Time2.minute = Time2.second * 60;
  Time2.hour = Time2.minute * 60;
  Time2.day = Time2.hour * 24;
  Time2.week = Time2.day * 7;
  let timezoneOffset = (/* @__PURE__ */ new Date()).getTimezoneOffset();
  function setTimezoneOffset(offset) {
    timezoneOffset = offset;
  }
  Time2.setTimezoneOffset = setTimezoneOffset;
  function getTimezoneOffset() {
    return timezoneOffset;
  }
  Time2.getTimezoneOffset = getTimezoneOffset;
  function getDateNumber(date2 = /* @__PURE__ */ new Date(), offset) {
    if (typeof date2 === "number") date2 = new Date(date2);
    if (offset === void 0) offset = timezoneOffset;
    return Math.floor((date2.valueOf() / Time2.minute - offset) / 1440);
  }
  Time2.getDateNumber = getDateNumber;
  function fromDateNumber(value, offset) {
    const date2 = new Date(value * Time2.day);
    if (offset === void 0) offset = timezoneOffset;
    return new Date(+date2 + offset * Time2.minute);
  }
  Time2.fromDateNumber = fromDateNumber;
  const numeric = /\d+(?:\.\d+)?/.source;
  const timeRegExp = new RegExp(`^${[
    "w(?:eek(?:s)?)?",
    "d(?:ay(?:s)?)?",
    "h(?:our(?:s)?)?",
    "m(?:in(?:ute)?(?:s)?)?",
    "s(?:ec(?:ond)?(?:s)?)?"
  ].map((unit) => `(${numeric}${unit})?`).join("")}$`);
  function parseTime(source) {
    const capture = timeRegExp.exec(source);
    if (!capture) return 0;
    return (parseFloat(capture[1]) * Time2.week || 0) + (parseFloat(capture[2]) * Time2.day || 0) + (parseFloat(capture[3]) * Time2.hour || 0) + (parseFloat(capture[4]) * Time2.minute || 0) + (parseFloat(capture[5]) * Time2.second || 0);
  }
  Time2.parseTime = parseTime;
  function parseDate(date2) {
    const parsed = parseTime(date2);
    if (parsed) date2 = Date.now() + parsed;
    else if (/^\d{1,2}(:\d{1,2}){1,2}$/.test(date2)) date2 = `${(/* @__PURE__ */ new Date()).toLocaleDateString()}-${date2}`;
    else if (/^\d{1,2}-\d{1,2}-\d{1,2}(:\d{1,2}){1,2}$/.test(date2)) date2 = `${(/* @__PURE__ */ new Date()).getFullYear()}-${date2}`;
    return date2 ? new Date(date2) : /* @__PURE__ */ new Date();
  }
  Time2.parseDate = parseDate;
  function format(ms) {
    const abs = Math.abs(ms);
    if (abs >= Time2.day - Time2.hour / 2) return Math.round(ms / Time2.day) + "d";
    else if (abs >= Time2.hour - Time2.minute / 2) return Math.round(ms / Time2.hour) + "h";
    else if (abs >= Time2.minute - Time2.second / 2) return Math.round(ms / Time2.minute) + "m";
    else if (abs >= Time2.second) return Math.round(ms / Time2.second) + "s";
    return ms + "ms";
  }
  Time2.format = format;
  function toDigits(source, length = 2) {
    return source.toString().padStart(length, "0");
  }
  Time2.toDigits = toDigits;
  function template(template2, time = /* @__PURE__ */ new Date()) {
    return template2.replace("yyyy", time.getFullYear().toString()).replace("yy", time.getFullYear().toString().slice(2)).replace("MM", toDigits(time.getMonth() + 1)).replace("dd", toDigits(time.getDate())).replace("hh", toDigits(time.getHours())).replace("mm", toDigits(time.getMinutes())).replace("ss", toDigits(time.getSeconds())).replace("SSS", toDigits(time.getMilliseconds(), 3));
  }
  Time2.template = template;
})(Time || (Time = {}));

// node_modules/@deepseek-ai/cordis/lib/index.js
var DisposableList = class {
  sn = 0;
  map = /* @__PURE__ */ new Map();
  weak = /* @__PURE__ */ new WeakMap();
  get length() {
    return this.map.size;
  }
  push(value) {
    const sn = ++this.sn;
    this.map.set(sn, value);
    this.weak.set(value, sn);
    return () => this.map.delete(sn);
  }
  delete(value) {
    const sn = this.weak.get(value);
    if (!sn) return false;
    return this.map.delete(sn);
  }
  clear() {
    const values = [...this.map.values()];
    this.map.clear();
    return values.reverse();
  }
  [Symbol.iterator]() {
    return this.map.values();
  }
  [Symbol.for("nodejs.util.inspect.custom")]() {
    return [...this];
  }
};
var symbols = {
  shadow: Symbol.for("cordis.shadow"),
  receiver: Symbol.for("cordis.receiver"),
  original: Symbol.for("cordis.original"),
  metadata: Symbol.for("cordis.metadata"),
  initHooks: Symbol.for("cordis.initHooks"),
  checkProto: Symbol.for("cordis.checkProto"),
  effect: Symbol.for("cordis.effect"),
  filter: Symbol.for("cordis.filter"),
  isolate: Symbol.for("cordis.isolate"),
  intercept: Symbol.for("cordis.intercept"),
  init: Symbol.for("cordis.init"),
  check: Symbol.for("cordis.check"),
  config: Symbol.for("cordis.config"),
  invoke: Symbol.for("cordis.invoke"),
  extend: Symbol.for("cordis.extend"),
  tracker: Symbol.for("cordis.tracker"),
  resolveConfig: Symbol.for("cordis.resolveConfig")
};
var GeneratorFunction = function* () {
}.constructor;
var AsyncGeneratorFunction = async function* () {
}.constructor;
function isConstructor(func) {
  if (!func.prototype) return false;
  if (func instanceof GeneratorFunction) return false;
  if (AsyncGeneratorFunction !== Function && func instanceof AsyncGeneratorFunction) return false;
  return true;
}
function joinPrototype(proto1, proto2) {
  if (proto1 === Object.prototype) return proto2;
  const result = Object.create(joinPrototype(Object.getPrototypeOf(proto1), proto2));
  for (const key of Reflect.ownKeys(proto1)) Object.defineProperty(result, key, Object.getOwnPropertyDescriptor(proto1, key));
  return result;
}
function isObject(value) {
  return value && (typeof value === "object" || typeof value === "function");
}
function getPropertyDescriptor(target, prop) {
  let proto = target;
  while (proto) {
    const desc = Reflect.getOwnPropertyDescriptor(proto, prop);
    if (desc) return desc;
    proto = Object.getPrototypeOf(proto);
  }
}
function getTraceable(ctx, value) {
  if (!isObject(value)) return value;
  if (Object.hasOwn(value, symbols.shadow)) return Object.getPrototypeOf(value);
  const tracker = value[symbols.tracker];
  if (!tracker) return value;
  return createTraceable(ctx, value, tracker);
}
function withProps(target, props) {
  if (!props) return target;
  return new Proxy(target, {
    get: (target2, prop, receiver) => {
      if (prop in props && prop !== "constructor") return Reflect.get(props, prop, receiver);
      return Reflect.get(target2, prop, receiver);
    },
    set: (target2, prop, value, receiver) => {
      if (prop in props && prop !== "constructor") return Reflect.set(props, prop, value, receiver);
      return Reflect.set(target2, prop, value, receiver);
    }
  });
}
function withProp(target, prop, value) {
  return withProps(target, Object.defineProperty(/* @__PURE__ */ Object.create(null), prop, {
    value,
    writable: false
  }));
}
function createShadow(ctx, target, property2, receiver) {
  if (!property2) return receiver;
  const origin = Reflect.getOwnPropertyDescriptor(target, property2)?.value;
  if (!origin) return receiver;
  return withProp(receiver, property2, ctx.extend({ [symbols.shadow]: origin }));
}
function createShadowMethod(ctx, value, outer, shadow) {
  return new Proxy(value, { apply: (target, thisArg, args) => {
    if (thisArg === outer) thisArg = shadow;
    return getTraceable(ctx, Reflect.apply(target, thisArg, args));
  } });
}
function createTraceable(ctx, value, tracker) {
  if (ctx[symbols.shadow] && !tracker.noShadow) ctx = Object.getPrototypeOf(ctx);
  const proxy = new Proxy(value, {
    get: (target, prop, receiver) => {
      if (prop === symbols.original) return target;
      if (prop === tracker.property) return ctx;
      if (typeof prop === "symbol") return Reflect.get(target, prop, receiver);
      if (tracker.associate && ctx.reflect.props[`${tracker.associate}.${prop}`]) return Reflect.get(ctx, `${tracker.associate}.${prop}`, withProp(ctx, symbols.receiver, receiver));
      let shadow, innerValue;
      const desc = getPropertyDescriptor(target, prop);
      if (desc && "value" in desc) innerValue = desc.value;
      else {
        shadow = createShadow(ctx, target, tracker.property, receiver);
        innerValue = Reflect.get(target, prop, shadow);
      }
      const innerTracker = innerValue?.[symbols.tracker];
      if (innerTracker) return createTraceable(ctx, innerValue, innerTracker);
      else if (!tracker.noShadow && typeof innerValue === "function") {
        shadow ??= createShadow(ctx, target, tracker.property, receiver);
        return createShadowMethod(ctx, innerValue, receiver, shadow);
      } else return innerValue;
    },
    set: (target, prop, value2, receiver) => {
      if (prop === symbols.original) return false;
      if (prop === tracker.property) return false;
      if (typeof prop === "symbol") return Reflect.set(target, prop, value2, receiver);
      if (tracker.associate && ctx.reflect.props[`${tracker.associate}.${prop}`]) return Reflect.set(ctx, `${tracker.associate}.${prop}`, value2, withProp(ctx, symbols.receiver, receiver));
      const shadow = createShadow(ctx, target, tracker.property, receiver);
      return Reflect.set(target, prop, value2, shadow);
    },
    apply: (target, thisArg, args) => {
      return applyTraceable(proxy, target, thisArg, args);
    }
  });
  return proxy;
}
function applyTraceable(proxy, value, thisArg, args) {
  if (!value[symbols.invoke]) return Reflect.apply(value, thisArg, args);
  return value[symbols.invoke].apply(proxy, args);
}
function createCallable(name, proto, tracker) {
  const self = function(...args) {
    return applyTraceable(createTraceable(self["ctx"], self, tracker), self, this, args);
  };
  defineProperty(self, "name", name);
  return Object.setPrototypeOf(self, proto);
}
function handleError(info, reason, getOuterStack) {
  const innerLines = info.error.stack.split("\n");
  if (typeof reason?.stack !== "string") {
    const outerError = new Error(reason);
    const lines2 = outerError.stack.split("\n");
    lines2.splice(1, Infinity, ...getOuterStack());
    outerError.stack = lines2.join("\n");
    throw outerError;
  }
  const lines = reason.stack.split("\n");
  let index = lines.indexOf(innerLines[2]);
  if (index === -1) throw reason;
  index -= info.offset;
  while (index > 0) {
    if (!lines[index - 1].endsWith(" (<anonymous>)")) break;
    index -= 1;
  }
  lines.splice(index, Infinity, ...getOuterStack());
  reason.stack = lines.join("\n");
  throw reason;
}
function composeError(callback, getOuterStack = buildOuterStack()) {
  const info = {
    offset: 1,
    error: /* @__PURE__ */ new Error()
  };
  try {
    const result = callback(info);
    if (isObject(result) && "then" in result) return result.then(void 0, (reason) => handleError(info, reason, getOuterStack));
    else return result;
  } catch (reason) {
    handleError(info, reason, getOuterStack);
  }
}
function buildOuterStack(offset = 0) {
  const outerError = /* @__PURE__ */ new Error();
  return () => outerError.stack.split("\n").slice(3 + offset);
}
function isBailed(value) {
  return value !== null && value !== false && value !== void 0;
}
var EventsService = class {
  ctx;
  _hooks = {};
  constructor(ctx) {
    this.ctx = ctx;
    defineProperty(this, symbols.tracker, {
      property: "ctx",
      noShadow: true
    });
    this.on("internal/listener", function(name, listener, options) {
      if (name === "internal/update" && !options.global) return (this.fiber._hooks["internal/update"] ??= new DisposableList())[options.prepend ? "unshift" : "push"](listener);
    });
    this.on("internal/update", function(config, noSave, next) {
      const cbs = [...this._hooks["internal/update"] || []];
      const _next = () => {
        return (cbs.shift() ?? next).call(this, config, noSave, _next);
      };
      return _next();
    }, {
      global: true,
      prepend: true
    });
  }
  /**
  * Resolve listeners for one dispatch and apply context filtering.
  *
  * @param type — the dispatch mode, reported on `internal/dispatch`.
  * @param args — the raw dispatch arguments; consumed up to the event name.
  * @returns the matching listener callbacks, bound to the dispatch `this`.
  */
  dispatch(type, args) {
    const thisArg = typeof args[0] === "object" || typeof args[0] === "function" ? args.shift() : null;
    const name = args.shift();
    if (!name.startsWith("internal/")) this.emit("internal/dispatch", type, name, args, thisArg);
    const filter = thisArg?.[Context.filter];
    return (this._hooks[name] || []).filter((hook) => hook.global || !filter || filter.call(thisArg, hook.ctx)).map((hook) => hook.callback.bind(thisArg));
  }
  /**
  * Run listeners concurrently and wait for all of them.
  *
  * @param args — optional `this`, the event name, then listener arguments.
  * @returns a promise resolving once every listener has settled.
  */
  async parallel(...args) {
    const errors = (await Promise.allSettled(this.dispatch("emit", args).map(async (cb) => cb(...args)))).filter((result) => result.status === "rejected");
    if (errors.length) throw new AggregateError(errors.map((error2) => error2.reason));
  }
  /**
  * Run listeners synchronously without waiting for returned promises.
  *
  * @param args — optional `this`, the event name, then listener arguments.
  */
  emit(...args) {
    this.dispatch("emit", args).map((cb) => cb(...args));
  }
  /**
  * Run listeners in order, awaiting each, until one returns a bail value.
  *
  * @param args — optional `this`, the event name, then listener arguments.
  * @returns the first bail value (see {@link isBailed}), if any.
  */
  async serial(...args) {
    for (const cb of this.dispatch("serial", args)) {
      const result = await cb(...args);
      if (isBailed(result)) return result;
    }
  }
  /**
  * Run listeners synchronously until one returns a bail value.
  *
  * @param args — optional `this`, the event name, then listener arguments.
  * @returns the first bail value (see {@link isBailed}), if any.
  */
  bail(...args) {
    for (const cb of this.dispatch("bail", args)) {
      const result = cb(...args);
      if (isBailed(result)) return result;
    }
  }
  /**
  * Compose listeners around the final `next` callback.
  *
  * The last dispatch argument is treated as the innermost `next`. Listeners
  * run outermost-first; a listener that does not call `next()` vetoes the
  * rest of the chain, including the built-in behavior.
  *
  * @param args — optional `this`, the event name, listener arguments, then `next`.
  * @returns the outermost listener's return value.
  */
  waterfall(...args) {
    const cbs = this.dispatch("waterfall", args);
    const inner = args.pop();
    const next = () => {
      return (cbs.shift() ?? inner)(...args);
    };
    args.push(next);
    return next();
  }
  /**
  * Store a listener record as an effect on the current fiber.
  *
  * @param label — effect label shown in fiber diagnostics.
  * @param hooks — the listener list for one event.
  * @param callback — the listener to store.
  * @param options — placement and filtering options.
  * @returns a disposer that unregisters the listener.
  */
  register(label, hooks, callback, options) {
    const method = options.prepend ? "unshift" : "push";
    return this.ctx.fiber.effect(() => {
      hooks[method]({
        ctx: this.ctx,
        callback,
        ...options
      });
      return () => this.unregister(hooks, callback);
    }, label);
  }
  /**
  * Remove a stored listener record.
  *
  * @param hooks — the listener list for one event.
  * @param callback — the listener to remove.
  * @returns `true` if the listener was found and removed.
  */
  unregister(hooks, callback) {
    const index = hooks.findIndex((hook) => hook.callback === callback);
    if (index >= 0) {
      hooks.splice(index, 1);
      return true;
    }
  }
  /**
  * Register an event listener owned by the current fiber.
  *
  * The listener is removed automatically when the fiber unloads. Throws
  * `CordisError('INACTIVE_EFFECT')` if the fiber is already disposed.
  *
  * @param name — the event name to listen for.
  * @param listener — called with the dispatch arguments.
  * @param options — listener options; a boolean is shorthand for `prepend`.
  * @returns a disposer removing the listener; `true` if it was still registered.
  */
  on(name, listener, options) {
    if (typeof options !== "object") options = { prepend: options };
    this.ctx.fiber.assertActive();
    listener = this.ctx.reflect.bind(listener);
    const result = this.bail(this.ctx, "internal/listener", name, listener, options);
    if (result) return result;
    const hooks = this._hooks[name] ||= [];
    const label = `ctx.on(${typeof name === "string" ? JSON.stringify(name) : name.toString()})`;
    return this.register(label, hooks, listener, options);
  }
  /**
  * Register an event listener that disposes itself after the first call.
  *
  * @param name — the event name to listen for.
  * @param listener — called at most once with the dispatch arguments.
  * @param options — listener options; a boolean is shorthand for `prepend`.
  * @returns a disposer removing the listener; `true` if it was still registered.
  */
  once(name, listener, options) {
    const dispose = this.on(name, function(...args) {
      dispose();
      return listener.apply(this, args);
    }, options);
    return dispose;
  }
};
var defaultFormatters = {
  s: (value) => String(value),
  d: (value) => Math.trunc(Number(value)),
  i: (value) => Math.trunc(Number(value)),
  f: (value) => Number(value),
  o: (value) => JSON.stringify(value),
  O: (value) => JSON.stringify(value),
  c: () => "",
  C: (value, exporter, message) => {
    return Logger.color(exporter, Logger.code(message.name, exporter.colors), value);
  }
};
function isAggregateError(error2) {
  return error2 instanceof Error && Array.isArray(error2["errors"]);
}
var Logger = class {
  service;
  static color(exporter, code, value, decoration = "") {
    if (!exporter.colors) return "" + value;
    return `\x1B[3${code < 8 ? code : "8;5;" + code}${exporter.colors >= 2 ? decoration : ""}m${value}\x1B[0m`;
  }
  static code(name, level) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = (hash << 3) - hash + name.charCodeAt(i) + 13;
      hash |= 0;
    }
    const colors = !level ? [] : level >= 2 ? c256 : c16;
    return colors[Math.abs(hash) % colors.length];
  }
  static format(exporter, message) {
    const args = message.args.slice();
    if (args[0] instanceof Error) {
      args[0] = args[0].stack || args[0].message;
      args.unshift("%s");
    } else if (typeof args[0] !== "string") args.unshift("%o");
    let format = args.shift();
    format = format.replace(/%([a-zA-Z%])/g, (match, char) => {
      if (match === "%%") return "%";
      const formatter = exporter.formatters?.[char] ?? defaultFormatters[char];
      if (typeof formatter === "function") return formatter(args.shift(), exporter, message);
      return match;
    });
    const oFormatter = exporter.formatters?.o ?? defaultFormatters.o;
    for (let arg of args) {
      if (typeof arg === "object" && arg) arg = oFormatter(arg, exporter, message);
      format += " " + arg;
    }
    const { maxLength = 10240 } = exporter;
    return format.split(/\r?\n/g).map((line) => {
      return line.slice(0, maxLength) + (line.length > maxLength ? "..." : "");
    }).join("\n");
  }
  constructor(options, service) {
    this.service = service;
    Object.assign(this, options);
    this.error = this._method("error", 0);
    this.info = this._method("info", 1);
    this.warn = this._method("warn", 2);
    this.debug = this._method("debug", 3);
  }
  _method(type, level) {
    return (...args) => {
      if (args.length === 1 && args[0] instanceof Error) {
        if (args[0].cause) this[type](args[0].cause);
        else if (isAggregateError(args[0])) {
          args[0].errors.forEach((error2) => this[type](error2));
          return;
        }
      }
      const sn = ++this.service._snMessage;
      const ts = Date.now();
      for (const exporter of this.service.exporters.values()) {
        if ((exporter.levels?.[this.name] ?? exporter.levels?.default ?? this.level ?? 1) < level) continue;
        const message = {
          sn,
          ts,
          type,
          level,
          name: this.name,
          ...this.meta,
          args
        };
        exporter.export(message);
      }
    };
  }
};
var c16 = [
  6,
  2,
  3,
  4,
  5,
  1
];
var c256 = [
  20,
  21,
  26,
  27,
  32,
  33,
  38,
  39,
  40,
  41,
  42,
  43,
  44,
  45,
  56,
  57,
  62,
  63,
  68,
  69,
  74,
  75,
  76,
  77,
  78,
  79,
  80,
  81,
  92,
  93,
  98,
  99,
  112,
  113,
  129,
  134,
  135,
  148,
  149,
  160,
  161,
  162,
  163,
  164,
  165,
  166,
  167,
  168,
  169,
  170,
  171,
  172,
  173,
  178,
  179,
  184,
  185,
  196,
  197,
  198,
  199,
  200,
  201,
  202,
  203,
  204,
  205,
  206,
  207,
  208,
  209,
  214,
  215,
  220,
  221
];
var LoggerService = class LoggerService2 {
  bufferSize = 1e3;
  buffer = [];
  ctx;
  _snMessage = 0;
  _snExporter = 0;
  exporters = /* @__PURE__ */ new Map();
  constructor(ctx) {
    const tracker = {
      property: "ctx",
      noShadow: true
    };
    const self = createCallable("logger", joinPrototype(Object.getPrototypeOf(this), Function.prototype), tracker);
    Object.assign(self, this);
    self.ctx = ctx;
    defineProperty(self, symbols.tracker, tracker);
    self.exporter({
      colors: 3,
      export: (message) => {
        self.buffer.push(message);
        if (self.buffer.length > self.bufferSize) self.buffer = self.buffer.slice(-self.bufferSize);
      }
    });
    return self;
  }
  /**
  * Register an exporter and dispose it with the current fiber.
  *
  * @param exporter — the sink that receives structured log messages.
  * @returns a disposer that removes the exporter.
  */
  exporter(exporter) {
    return this.ctx.effect(() => {
      this.exporters.set(++this._snExporter, exporter);
      return () => this.exporters.delete(this._snExporter);
    }, "ctx.logger.exporter()");
  }
  _resolveConfig() {
    let intercept = this.ctx[symbols.intercept];
    const configs = [];
    while ("logger" in intercept) {
      if (Object.hasOwn(intercept, "logger")) configs.unshift(intercept["logger"]);
      intercept = Object.getPrototypeOf(intercept);
    }
    return Object.assign({}, ...configs);
  }
  [symbols.invoke](name) {
    const config = this._resolveConfig();
    const fiber = (this.ctx[symbols.shadow] ?? this.ctx).fiber;
    name ??= config.name;
    name ??= hyphenate(fiber.name);
    return new Logger({
      name,
      level: config.level,
      meta: { fiber: new WeakRef(fiber) }
    }, this);
  }
  static {
    for (const type of [
      "error",
      "info",
      "warn",
      "debug"
    ]) LoggerService2.prototype[type] = function(...args) {
      return this()[type](...args);
    };
  }
};
function enhanceError(error2) {
  const lines = error2.stack.split("\n");
  lines.splice(0, 2, `Error: ${error2.message}`);
  error2.stack = lines.join("\n");
  return error2;
}
var RESERVED_WORDS = ["prototype", "then"];
function isSpecialProperty(prop) {
  return typeof prop === "symbol" || RESERVED_WORDS.includes(prop) || parseInt(prop).toString() === prop || prop.startsWith("_");
}
var ReflectService = class {
  ctx;
  /** Proxy traps implementing service resolution for every context object. */
  static handler = {
    get: (target, prop, ctx) => {
      if (isSpecialProperty(prop)) return Reflect.get(target, prop, ctx);
      if (Reflect.has(target, prop)) return getTraceable(ctx, Reflect.get(target, prop, ctx));
      const error2 = /* @__PURE__ */ new Error(`cannot get property "${prop}" without inject`);
      try {
        const def = target.reflect.props[prop];
        if (def?.type === "accessor") return def.get.call(ctx, ctx[symbols.receiver], error2);
        if (!ctx.fiber.runtime) return ctx.reflect.get(prop, false);
        return ctx.events.waterfall("internal/get", ctx, prop, error2, () => {
          const key = target[symbols.isolate][prop];
          let fiber = (ctx[symbols.shadow] ?? ctx).fiber;
          while (true) {
            const impl = fiber.store?.[prop];
            if (impl) return getTraceable(ctx, impl.value);
            if (prop in fiber.inject) {
              error2.message = `cannot get required service "${prop}" in inactive context`;
              throw error2;
            }
            if (!fiber.runtime) throw error2;
            if (fiber.parent[symbols.isolate][prop] !== key) throw error2;
            fiber = fiber.parent.fiber;
          }
        });
      } catch (e) {
        throw e === error2 ? enhanceError(e) : e;
      }
    },
    set: (target, prop, value, ctx) => {
      if (isSpecialProperty(prop)) return Reflect.set(target, prop, value, ctx);
      const error2 = /* @__PURE__ */ new Error(`cannot set property "${prop}" without provide`);
      const def = target.reflect.props[prop];
      if (!def) {
        if (!ctx.fiber.runtime) return Reflect.set(target, prop, value, ctx);
        throw enhanceError(error2);
      }
      try {
        if (def.type === "accessor") {
          if (!def.set) return false;
          return def.set.call(ctx, value, ctx[symbols.receiver], error2);
        }
        return ctx.events.waterfall("internal/set", ctx, prop, value, error2, () => {
          return ctx.reflect.set(prop, value, error2);
        });
      } catch (e) {
        throw e === error2 ? enhanceError(e) : e;
      }
    },
    has: (target, prop) => {
      if (isSpecialProperty(prop)) return Reflect.has(target, prop);
      if (Reflect.has(target, prop)) return true;
      return !!target.reflect.props[prop];
    }
  };
  /** Service implementations, keyed by isolation label. */
  store = /* @__PURE__ */ Object.create(null);
  /** Declared context properties (services and accessors), by name. */
  props = /* @__PURE__ */ Object.create(null);
  constructor(ctx) {
    this.ctx = ctx;
    defineProperty(this, symbols.tracker, {
      property: "ctx",
      noShadow: true
    });
    this.mixin("reflect", [
      "get",
      "set",
      "provide",
      "accessor",
      "mixin"
    ]);
    this.mixin("fiber", ["runtime", "effect"]);
    this.mixin("registry", ["inject", "plugin"]);
    this.mixin("events", [
      "on",
      "once",
      "parallel",
      "emit",
      "serial",
      "bail",
      "waterfall"
    ]);
  }
  /**
  * Read a service from the store without the inject requirement.
  *
  * @param name — the service name.
  * @param strict — when `true`, only return implementations whose providing
  * fiber is currently active.
  * @returns the service value, or `undefined` when not (yet) provided.
  */
  get(name, strict = true) {
    return getTraceable(this.ctx, this._getImpl(name, strict)?.value);
  }
  _getImpl(name, strict = true) {
    const key = this.ctx[symbols.isolate][name];
    const impl = key && this.store[key];
    if (!impl) return;
    if (strict && impl.fiber.state !== 2) return;
    return impl;
  }
  /**
  * Overwrite a provided service's value.
  *
  * @param name — the service name.
  * @param value — the new service value.
  * @param error — carrier for the caller stack in diagnostics.
  * @returns `true` on success.
  * @throws when `name` was never provided, or was provided by another fiber.
  */
  set(name, value, error2) {
    const key = this.ctx[symbols.isolate][name];
    const impl = this.store[key];
    if (!impl) throw new Error(`cannot set property "${name}" without provide`);
    if (impl.fiber !== this.ctx.fiber) throw new Error(`cannot set property "${name}" in multiple fibers`);
    impl.value = value;
    return true;
  }
  /**
  * Register a service implementation owned by the current fiber.
  *
  * See the `ctx.provide()` overload above for the full contract.
  *
  * @param name — the service name.
  * @param value — the service value.
  * @param check — optional availability predicate for dependents.
  * @returns a disposer that unregisters the service.
  */
  provide(name, value, check) {
    return this.ctx.fiber.effect(() => {
      if (!this.props[name]) this.props[name] ??= { type: "service" };
      else if (this.props[name].type !== "service") throw new Error(`property "${name}" is already declared as ${this.props[name].type}`);
      this.props[name] = { type: "service" };
      this.ctx.root[symbols.isolate][name] ??= Symbol(name);
      const key = this.ctx[symbols.isolate][name];
      const impl = {
        name,
        value,
        fiber: this.ctx.fiber,
        check
      };
      if (this.store[key]) throw new Error(`service "${name}" has been registered at <${this.store[key].fiber.name}>`);
      this.store[key] = impl;
      this.ctx.fiber.store[name] = impl;
      if (this.ctx.fiber.state === 2) this.notify([name]);
      return async () => {
        delete this.store[key];
        const fibers = this.notify([name]);
        await Promise.allSettled(fibers.map((fiber) => fiber.await()));
        delete this.ctx.fiber.store[name];
      };
    }, `ctx.provide(${JSON.stringify(name)})`);
  }
  /**
  * Re-evaluate every fiber that requires one of the given services.
  *
  * @param names — the service names that changed.
  * @param filter — restricts notification to matching isolation scopes.
  * @returns the fibers whose dependency state was refreshed.
  */
  notify(names, filter = (ctx, name) => ctx[symbols.isolate][name] === this.ctx[symbols.isolate][name]) {
    const fibers = [];
    for (const runtime of this.ctx.registry.values()) for (const fiber of runtime.fibers) {
      let hasUpdate = false;
      for (const name of names) {
        if (!(name in fiber.inject)) continue;
        if (!filter(fiber.ctx, name)) continue;
        hasUpdate = true;
        fiber._checkImpl(name);
      }
      if (!hasUpdate) continue;
      fiber._refresh();
      fibers.push(fiber);
    }
    for (const name of names) {
      const self = Object.create(this.ctx);
      self[symbols.filter] = (target) => filter(target, name);
      this.ctx.events.emit(self, "internal/service", name, this._getImpl(name, false)?.value);
    }
    return fibers;
  }
  /**
  * Define a computed context property backed by get/set hooks.
  *
  * @param name — the context property name.
  * @param options — the `get` hook and optional `set` hook.
  * @returns a disposer that removes the accessor.
  */
  accessor(name, options) {
    return this.ctx.fiber.effect(() => {
      if (name in this.props) throw new Error(`property "${name}" is already declared as ${this.props[name].type}`);
      this.props[name] = {
        type: "accessor",
        ...options
      };
      return () => delete this.props[name];
    }, `ctx.accessor(${JSON.stringify(name)})`);
  }
  /**
  * Expose selected members of a service directly on `ctx`.
  *
  * See the `ctx.mixin()` overload above for the full contract.
  *
  * @param source — a context property name or a source object.
  * @param mixins — keys to forward, or a source-key → ctx-key map.
  * @returns a disposer that removes all created accessors.
  */
  mixin(source, mixins) {
    const self = this;
    return this.ctx.fiber.effect(function* () {
      const entries = Array.isArray(mixins) ? mixins.map((key) => [key, key]) : Object.entries(mixins);
      const getTarget = (ctx, error2) => {
        return ctx[source];
      };
      for (const [key, value] of entries) yield self.accessor(value, {
        get(receiver, error2) {
          const service = getTarget(this, error2);
          if (isNullable(service)) return service;
          const mixin = receiver ? withProps(receiver, service) : service;
          const value2 = Reflect.get(service, key, mixin);
          if (typeof value2 !== "function") return value2;
          return value2.bind(mixin ?? service);
        },
        set(value2, receiver, error2) {
          const service = getTarget(this, error2);
          const mixin = receiver ? withProps(receiver, service) : service;
          return Reflect.set(service, key, value2, mixin);
        }
      });
    }, `ctx.mixin(${JSON.stringify(source)})`);
  }
  /**
  * Attach this context's tracing wrapper to a value.
  *
  * @param value — the value to wrap.
  * @returns the traceable wrapper (or the value itself when not applicable).
  */
  trace(value) {
    return getTraceable(this.ctx, value);
  }
  /**
  * Wrap a callback so calls trace `this` and arguments to this context.
  *
  * @param callback — the function to wrap.
  * @returns a proxy delegating to `callback` with traced values.
  */
  bind(callback) {
    return new Proxy(callback, {
      apply: (target, thisArg, args) => {
        return Reflect.apply(target, this.trace(thisArg), args.map((arg) => this.trace(arg)));
      },
      construct: (target, args, newTarget) => {
        return Reflect.construct(target, args.map((arg) => this.trace(arg)), newTarget);
      }
    });
  }
};
var kValidationError = Symbol.for("ValidationError");
var ValidationError = class extends TypeError {
  name = "ValidationError";
  /**
  * Build the aggregated message from schema issues.
  *
  * @param issues — the standard-schema issues, one message line each.
  */
  constructor(issues) {
    super(`invalid config:
` + issues.map((issue2) => {
      if (issue2.path) return `  - ${issue2.message} (at ${issue2.path.join(".")})`;
      else return `  - ${issue2.message}`;
    }).join("\n"));
  }
};
Object.defineProperty(ValidationError.prototype, kValidationError, { value: true });
function resolveConfig(runtime, config) {
  if (!runtime.Config) return config;
  const result = runtime.Config["~standard"].validate(config);
  if ("then" in result) throw new TypeError("Async config validation is not supported");
  if (result.issues) throw new ValidationError(result.issues);
  else return result.value;
}
var effectInertia = /* @__PURE__ */ new WeakMap();
function runDisposable(dispose) {
  const result = dispose();
  return effectInertia.get(dispose)?.() ?? result;
}
function emitPluginDisposed(context, fiber) {
  const args = ["internal/plugin", fiber];
  let callbacks;
  try {
    callbacks = context.events.dispatch("emit", args);
  } catch (error2) {
    context.logger.error(error2);
    return;
  }
  for (const callback of callbacks) try {
    const returned = callback(...args);
    Promise.resolve(returned).catch((error2) => context.logger.error(error2));
  } catch (error2) {
    context.logger.error(error2);
  }
}
var CordisError = class CordisError2 extends Error {
  code;
  /**
  * @param code — the stable error code; also the default message.
  * @param message — optional human-readable override.
  */
  constructor(code, message) {
    super(message ?? CordisError2.Code[code]);
    this.code = code;
  }
};
(function(CordisError3) {
  CordisError3.Code = { INACTIVE_EFFECT: "cannot create effect on inactive context" };
})(CordisError || (CordisError = {}));
var INACTIVE = "__INACTIVE__";
var Fiber = class {
  parent;
  inject;
  runtime;
  /** Unique id within the registry; 0 for the root fiber, `null` once disposed. */
  uid;
  /** The context this fiber's plugin runs in (extends the parent context). */
  ctx;
  /** The validated plugin config (updated by `update()`). */
  config;
  /** The raw plugin config, re-resolved before each activation. */
  _config;
  /** Current lifecycle state; transitions emit `internal/status`. */
  state = 0;
  /** Dispose this fiber: unload the plugin, then settle once cleanup finished. */
  dispose;
  /** Snapshot of required service implementations while loaded; `undefined` otherwise. */
  store;
  /** The in-flight load/unload transition, if one is currently running. */
  inertia;
  _hooks = /* @__PURE__ */ Object.create(null);
  _disposables = new DisposableList();
  context;
  _error;
  _runner;
  _store = /* @__PURE__ */ Object.create(null);
  /**
  * Create a fiber. Plugin authors normally obtain fibers from `ctx.plugin()`
  * rather than constructing them directly.
  *
  * @param parent — the context the plugin was loaded from.
  * @param config — raw config, validated against the runtime's schema.
  * @param inject — resolved dependency map (service name → intercept config).
  * @param runtime — the shared plugin runtime, or `null` for the root fiber.
  * @param getOuterStack — captures the caller stack for effect diagnostics.
  */
  constructor(parent, config, inject, runtime, getOuterStack) {
    this.parent = parent;
    this.inject = inject;
    this.runtime = runtime;
    this._config = config;
    const collect = (dispose) => {
      this._disposables.push(dispose);
    };
    if (runtime) {
      this.uid = parent.registry.counter;
      this.ctx = this.context = parent.extend({ fiber: this });
      const injectEntries = Object.entries(this.inject);
      if (injectEntries.length) {
        this.ctx[Context.intercept] = Object.create(parent[Context.intercept]);
        for (const [name, config2] of injectEntries) {
          if (isNullable(config2)) continue;
          this.ctx[Context.intercept][name] = config2;
        }
      }
      this._runner = {
        epoch: INACTIVE,
        getOuterStack,
        execute: function() {
          if (isConstructor(runtime.callback)) {
            const instance = new runtime.callback(this.ctx, this.config);
            for (const hook of instance?.[symbols.initHooks] ?? []) hook();
            return instance?.[symbols.init]?.();
          } else return runtime.callback(this.ctx, this.config);
        },
        collect
      };
      this.dispose = parent.fiber.effect(() => {
        const remove = runtime.fibers.push(this);
        return async () => {
          this.uid = null;
          emitPluginDisposed(this.context, this);
          if (this.ctx.registry.has(runtime.callback)) {
            remove();
            if (!runtime.fibers.length) this.ctx.registry.delete(runtime.callback);
          }
          this._setEpoch(INACTIVE);
          if (!this.inertia) this._updateState(() => {
            this.inertia = this._unload();
            return 5;
          });
          while (this.inertia) await this.inertia;
        };
      }, "ctx.plugin()");
      try {
        this.context.emit("internal/plugin", this);
      } catch (error2) {
        Promise.resolve(this.dispose()).catch((reason) => this.ctx.logger.error(reason));
        throw error2;
      }
      if (this.uid !== null && parent.fiber.state !== 5) {
        for (const name of Object.keys(this.inject)) this._checkImpl(name);
        this._refresh();
      }
    } else {
      this.uid = 0;
      this.ctx = this.context = parent;
      this.state = 2;
      this.store = /* @__PURE__ */ Object.create(null);
      this._runner = {
        epoch: "",
        getOuterStack,
        execute: () => {
        },
        collect
      };
      this.dispose = () => this.restart();
    }
  }
  /** The plugin's display name, inherited from the nearest named ancestor, else `'root'`. */
  get name() {
    let fiber = this;
    do {
      if (fiber.runtime?.name) return fiber.runtime.name;
      fiber = fiber.parent.fiber;
    } while (fiber !== fiber.parent.fiber);
    return "root";
  }
  /**
  * Throw if the fiber has already been disposed.
  *
  * @returns nothing when the fiber is still active.
  * @throws {CordisError} `INACTIVE_EFFECT` when the fiber's uid has been cleared.
  */
  assertActive() {
    if (this.uid !== null) return;
    throw new CordisError("INACTIVE_EFFECT");
  }
  _execute(runner) {
    const oldEpoch = runner.epoch;
    return composeError((info) => {
      const safeCollect = (dispose) => {
        if (typeof dispose === "function") runner.collect(dispose);
        else if (!isNullable(dispose)) throw new TypeError("Invalid effect");
      };
      const effect = runner.execute.call(this);
      if (typeof effect === "function") return runner.collect(effect);
      else if (isNullable(effect)) {
      } else if (!isObject(effect)) throw new TypeError("Invalid effect");
      else if ("then" in effect) return effect.then(safeCollect);
      else if (Symbol.iterator in effect) {
        info.error = /* @__PURE__ */ new Error();
        const iter = effect[Symbol.iterator]();
        while (true) {
          const result = iter.next();
          safeCollect(result.value);
          if (result.done) return;
        }
      } else if (Symbol.asyncIterator in effect) {
        const iter = effect[Symbol.asyncIterator]();
        return (async () => {
          await Promise.resolve();
          info.error = /* @__PURE__ */ new Error();
          while (true) {
            if (runner.epoch !== oldEpoch) return;
            const result = await iter.next();
            safeCollect(result.value);
            if (result.done) return;
          }
        })();
      } else throw new TypeError("Invalid effect");
    }, runner.getOuterStack);
  }
  effect(execute, label = "anonymous") {
    this.assertActive();
    if (this.state === 5) throw new CordisError("INACTIVE_EFFECT");
    const disposables = [];
    let disposing = false;
    let disposalTask;
    const dispose = () => {
      if (disposing) return disposalTask;
      disposing = true;
      let task2;
      for (const disposable of disposables.splice(0).reverse()) if (task2) task2 = task2.then(() => runDisposable(disposable));
      else {
        const result = runDisposable(disposable);
        if (isObject(result) && "then" in result) task2 = result;
      }
      return disposalTask = task2;
    };
    const meta = {
      label,
      children: []
    };
    const runner = {
      execute,
      epoch: true,
      collect: (dispose2) => {
        disposables.push(dispose2);
        this._disposables.delete(dispose2);
        if (dispose2[symbols.effect]) meta.children.push(dispose2[symbols.effect]);
      },
      getOuterStack: buildOuterStack()
    };
    let task;
    let executing = true;
    let resolveSetup;
    let rejectSetup;
    let setupBarrier;
    let setupFailed = false;
    let inFlight;
    let removeWrapper = () => false;
    const waitForSetup = () => {
      setupBarrier ??= new Promise((resolve4, reject) => {
        resolveSetup = resolve4;
        rejectSetup = reject;
      });
      return setupBarrier;
    };
    const disposeAfter = (setup) => {
      return Promise.resolve(setup).then(() => dispose(), async (reason) => {
        await dispose();
        throw reason;
      });
    };
    const finalizeDisposal = (callback) => {
      let result;
      try {
        result = callback();
      } catch (error2) {
        removeWrapper();
        throw error2;
      }
      if (isObject(result) && "then" in result) {
        const pending = Promise.resolve(result).finally(() => {
          removeWrapper();
          if (inFlight === pending) inFlight = void 0;
        });
        return inFlight = pending;
      }
      removeWrapper();
      return result;
    };
    const wrapper = defineProperty(() => {
      if (!runner.epoch) return setupFailed ? inFlight : void 0;
      runner.epoch = false;
      return finalizeDisposal(() => {
        if (executing) return disposeAfter(waitForSetup());
        return task ? disposeAfter(task) : dispose();
      });
    }, symbols.effect, meta);
    effectInertia.set(wrapper, () => inFlight);
    removeWrapper = this._disposables.push(wrapper);
    try {
      task = this._execute(runner);
    } catch (reason) {
      executing = false;
      setupFailed = true;
      runner.epoch = false;
      let cleanup;
      try {
        cleanup = finalizeDisposal(dispose);
      } finally {
        rejectSetup?.(reason);
      }
      if (isObject(cleanup) && "then" in cleanup) cleanup.catch((error2) => this.ctx.logger.error(error2));
      throw reason;
    }
    executing = false;
    if (setupBarrier) Promise.resolve(task).then(resolveSetup, rejectSetup);
    task?.catch(() => {
      if (!runner.epoch) return dispose();
      return finalizeDisposal(dispose);
    }).catch((error2) => this.ctx.logger.error(error2));
    const disposeAsync = () => {
      if (!runner.epoch) return;
      runner.epoch = false;
      return finalizeDisposal(dispose);
    };
    wrapper.then = async (onFulfilled, onRejected) => {
      return Promise.resolve(task).then(() => disposeAsync).then(onFulfilled, onRejected);
    };
    return wrapper;
  }
  /**
  * Return metadata for currently registered effects.
  *
  * @returns one {@link EffectMeta} tree per labeled live effect.
  */
  getEffects() {
    return [...this._disposables].map((dispose) => dispose[symbols.effect]).filter(Boolean);
  }
  _getState() {
    if (this.uid === null) return 4;
    if (this._error) return 3;
    if (this._runner.epoch !== INACTIVE) return 2;
    return 0;
  }
  _updateState(callback) {
    const oldState = this.state;
    this.state = callback() ?? this._getState();
    if (oldState === this.state) return;
    this.context.emit("internal/status", this, oldState);
    if (oldState !== 2 && this.state !== 2) return;
    for (const key of Reflect.ownKeys(this.ctx.reflect.store)) {
      const impl = this.ctx.reflect.store[key];
      if (impl.fiber !== this) continue;
      this.ctx.reflect.notify([impl.name]);
    }
  }
  _checkImpl(name) {
    const impl = this.ctx.reflect._getImpl(name, true);
    if (!impl) return delete this._store[name];
    try {
      if (impl.check && !impl.check.call(getTraceable(this.ctx, impl.value))) return delete this._store[name];
    } catch (error2) {
      impl.fiber.ctx.logger.error(error2);
      return delete this._store[name];
    }
    this._store[name] = impl;
  }
  _refresh() {
    let epoch = false;
    epoch = "";
    for (const name of Object.keys(this.inject)) {
      const impl = this._store[name];
      if (!impl) {
        epoch = INACTIVE;
        break;
      }
      epoch += ":" + impl.fiber.uid;
    }
    this._setEpoch(epoch);
  }
  _setEpoch(epoch) {
    const oldEpoch = this._runner.epoch;
    if (epoch === oldEpoch) return;
    this._runner.epoch = epoch;
    if (this.inertia) return;
    this._updateState(() => {
      if (epoch !== INACTIVE && oldEpoch === INACTIVE) {
        this.inertia = this._reload();
        return 1;
      } else {
        this.inertia = this._unload();
        return 5;
      }
    });
  }
  _resolveConfig(config) {
    config = this.context.waterfall(this, "internal/config", config, () => config);
    return this.runtime ? resolveConfig(this.runtime, config) : config;
  }
  async _reload() {
    this.store = { ...this._store };
    const oldEpoch = this._runner.epoch;
    try {
      await Promise.resolve();
      if (this._runner.epoch === oldEpoch) {
        this.config = this._resolveConfig(this._config);
        await this._execute(this._runner);
        this._error = void 0;
      }
    } catch (reason) {
      this.ctx.logger.error(reason);
      this._error = reason;
      this._runner.epoch = INACTIVE;
    }
    this._updateState(() => {
      if (this._runner.epoch === oldEpoch) this.inertia = void 0;
      else {
        this.inertia = this._unload();
        return 5;
      }
    });
  }
  async _unload() {
    await Promise.all(this._disposables.clear().map(async (dispose) => {
      try {
        await composeError(async (info) => {
          await Promise.resolve();
          info.error = /* @__PURE__ */ new Error();
          await runDisposable(dispose);
        }, this._runner.getOuterStack);
      } catch (reason) {
        this.ctx.logger.error(reason);
      }
    }));
    this.store = void 0;
    this._updateState(() => {
      if (this._runner.epoch === INACTIVE) this.inertia = void 0;
      else {
        this.inertia = this._reload();
        return 1;
      }
    });
  }
  /**
  * Wait for current lifecycle work and rethrow startup errors.
  *
  * @returns this fiber, once it has settled into a stable state.
  * @throws the config-validation or plugin-startup error, if any.
  */
  async await() {
    while (this.inertia) await this.inertia;
    if (this._error) throw this._error;
    return this;
  }
  /**
  * Dispose and immediately reload this plugin with its current config.
  *
  * @returns a promise resolving once the reload settled.
  * @throws {CordisError} `INACTIVE_EFFECT` when the fiber is already disposed.
  */
  async restart() {
    this.assertActive();
    this._setEpoch(INACTIVE);
    this._refresh();
    await this.await();
  }
  /**
  * Validate and apply new config, then restart the plugin.
  *
  * Runs the `internal/update` waterfall first, so update hooks (and HMR)
  * can veto or replace the restart.
  *
  * @param config — the new raw config; validated before anything restarts.
  * @param noSave — hint for persistence hooks not to write the change back.
  * @returns the update waterfall result; the default restart returns a promise.
  * @throws when validation, an update listener, or the restarted plugin fails.
  */
  update(config, noSave = false) {
    this.assertActive();
    this._config = config;
    if (this.state !== 2) {
      this._error = void 0;
      this._setEpoch(INACTIVE);
      this._refresh();
      return;
    }
    config = this._resolveConfig(config);
    return this.context.waterfall(this, "internal/update", config, noSave, () => {
      this.config = config;
      this._error = void 0;
      return this.restart();
    });
  }
};
function isApplicable(object) {
  return object && typeof object === "object" && typeof object.apply === "function";
}
function Inject(name, config) {
  return function(value, decorator) {
    if (decorator.kind === "class") {
      if (!Object.hasOwn(value, "inject")) {
        defineProperty(value, "inject", Object.create(Object.getPrototypeOf(value).inject ?? null));
        defineProperty(value.inject, symbols.checkProto, true);
      }
      value.inject[name] = config;
    } else if (decorator.kind === "method") {
      const inject = (value[symbols.metadata] ??= {}).inject ??= /* @__PURE__ */ Object.create(null);
      inject[name] = config;
      decorator.addInitializer(function() {
        const property2 = this[symbols.tracker]?.property;
        (this[symbols.initHooks] ??= []).push(() => {
          this.ctx.inject(inject, (ctx) => {
            return value.call(property2 ? withProps(this, { [property2]: ctx }) : this);
          });
        });
      });
    } else throw new Error("@Inject() can only be used on class or class methods");
  };
}
(function(Inject2) {
  function resolve4(inject, result = /* @__PURE__ */ Object.create(null)) {
    if (!inject) return result;
    if (Array.isArray(inject)) for (const name of inject) result[name] = null;
    else if (Reflect.has(inject, symbols.checkProto)) {
      Object.assign(result, resolve4(Object.getPrototypeOf(inject)));
      for (const name of Object.keys(inject)) result[name] = inject[name] ?? null;
    } else for (const name of Object.keys(inject)) result[name] = inject[name] ?? null;
    return result;
  }
  Inject2.resolve = resolve4;
})(Inject || (Inject = {}));
var RegistryService = class {
  ctx;
  _counter = 0;
  _internal = /* @__PURE__ */ new Map();
  constructor(ctx) {
    this.ctx = ctx;
    defineProperty(this, symbols.tracker, {
      property: "ctx",
      noShadow: true
    });
  }
  /** Allocate the next fiber uid (increments on every read). */
  get counter() {
    return ++this._counter;
  }
  /** Number of registered plugin runtimes. */
  get size() {
    return this._internal.size;
  }
  /**
  * Resolve a supported plugin shape to its executable callback.
  *
  * @param plugin — a function, class, or `{ apply }` object plugin.
  * @returns the callback identifying the plugin, or `undefined` if invalid.
  */
  resolve(plugin) {
    try {
      if (typeof plugin === "function") return plugin;
      if (isApplicable(plugin)) return plugin.apply;
    } catch {
    }
  }
  /**
  * Look up the runtime record for a plugin.
  *
  * @param plugin — any supported plugin shape.
  * @returns the runtime, or `undefined` when the plugin is not registered.
  */
  get(plugin) {
    const key = this.resolve(plugin);
    return key && this._internal.get(key);
  }
  /**
  * Check whether a plugin has a registered runtime.
  *
  * @param plugin — any supported plugin shape.
  * @returns `true` when at least one fiber of the plugin exists.
  */
  has(plugin) {
    const key = this.resolve(plugin);
    return !!key && this._internal.has(key);
  }
  /**
  * Dispose every running fiber for a plugin and remove its runtime record.
  *
  * @param plugin — any supported plugin shape.
  * @returns the removed runtime, or `undefined` when none was registered.
  */
  delete(plugin) {
    const key = this.resolve(plugin);
    const runtime = key && this._internal.get(key);
    if (!runtime) return;
    this._internal.delete(key);
    for (const fiber of runtime.fibers) fiber.dispose();
    return runtime;
  }
  /** Iterate the registered plugin callbacks. */
  keys() {
    return this._internal.keys();
  }
  /** Iterate the registered plugin runtimes. */
  values() {
    return this._internal.values();
  }
  /** Iterate `[callback, runtime]` pairs. */
  entries() {
    return this._internal.entries();
  }
  /**
  * Visit every registered runtime.
  *
  * @param callback — receives each runtime and its identifying callback.
  */
  forEach(callback) {
    return this._internal.forEach(callback);
  }
  /**
  * Start a callback once the requested dependencies are available.
  *
  * @param inject — required services, as an array or a name → config map.
  * @param callback — plugin body called with `(ctx, config)`.
  * @returns the fiber; awaiting it settles once loading finished.
  */
  inject(inject, callback) {
    return this.plugin({
      inject,
      apply: callback,
      name: callback.name
    });
  }
  /**
  * Start a plugin in the current context and return its fiber.
  *
  * Creates (or reuses) the plugin's runtime record, then starts a new fiber
  * under the current context. Throws if `plugin` is not a supported shape or
  * if the current fiber is already disposed.
  *
  * @param plugin — a function, class, or `{ apply }` object plugin.
  * @param config — the plugin config, validated against its `Config` schema.
  * @param getOuterStack — captures the caller stack for effect diagnostics.
  * @returns the fiber; awaiting it settles once loading finished.
  */
  plugin(plugin, config, getOuterStack = buildOuterStack()) {
    const callback = this.resolve(plugin);
    if (!callback) throw new Error('invalid plugin, expect function or object with an "apply" method, received ' + typeof plugin);
    this.ctx.fiber.assertActive();
    let runtime = this._internal.get(callback);
    if (!runtime) {
      let name = plugin.name;
      if (name === "apply") name = void 0;
      runtime = {
        name,
        callback,
        fibers: new DisposableList(),
        Config: plugin.Config
      };
      this._internal.set(callback, runtime);
    }
    const fiber = new Fiber(this.ctx, config, Inject.resolve(plugin.inject), runtime, getOuterStack);
    const wrapped = Object.create(fiber);
    wrapped.then = (onFulfilled, onRejected) => {
      return fiber.await().then(onFulfilled, onRejected);
    };
    return wrapped;
  }
};
var Context = class Context2 {
  /** Symbol key under which a disposer exposes its {@link EffectMeta} diagnostics tree. */
  static effect = symbols.effect;
  /** Symbol key for a context's listener filter, consulted on every event dispatch. */
  static filter = symbols.filter;
  /** Symbol key of the isolation map (see the `Context[symbols.isolate]` property). */
  static isolate = symbols.isolate;
  /** Symbol key of the intercept map (see the `Context[symbols.intercept]` property). */
  static intercept = symbols.intercept;
  /**
  * Returns true for Cordis context proxies and context prototypes.
  *
  * Works across realms and across multiple copies of cordis, because the
  * brand is keyed by a global symbol rather than by `instanceof`.
  *
  * @param value — the value to test.
  * @returns `true` if `value` is a Cordis context, narrowing its type.
  */
  static is(value) {
    return !!value?.[Context2.is];
  }
  static {
    Context2.is[Symbol.toPrimitive] = () => Symbol.for("cordis.is");
    Context2.prototype[Context2.is] = true;
  }
  /** Create the root context and install the built-in services. */
  constructor() {
    this[symbols.isolate] = /* @__PURE__ */ Object.create(null);
    this[symbols.intercept] = /* @__PURE__ */ Object.create(null);
    const self = new Proxy(this, ReflectService.handler);
    this.root = self;
    this.baseUrl = void 0;
    this.fiber = new Fiber(self, {}, /* @__PURE__ */ Object.create(null), null, () => []);
    this.reflect = new ReflectService(self);
    this.registry = new RegistryService(self);
    this.events = new EventsService(self);
    this.logger = new LoggerService(self);
    this.fiber._disposables.clear();
    return self;
  }
  [Symbol.for("nodejs.util.inspect.custom")]() {
    return `Context <${this.fiber.name}>`;
  }
  /**
  * Create a child context with extra metadata on top of the current scope.
  *
  * The child prototypally inherits every property of this context; own
  * properties of `meta` shadow the inherited ones. The parent is not mutated.
  *
  * @param meta — own properties (including symbol keys) to define on the child.
  * @returns a child context inheriting from this one.
  */
  extend(meta = {}) {
    const shadow = Reflect.getOwnPropertyDescriptor(this, symbols.shadow)?.value;
    const self = Object.create(getTraceable(this, this));
    for (const prop of Reflect.ownKeys(meta)) Object.defineProperty(self, prop, Reflect.getOwnPropertyDescriptor(meta, prop));
    if (!shadow) return self;
    return Object.assign(Object.create(self), { [symbols.shadow]: shadow });
  }
  /**
  * Create a child context with an independent service scope for `name`.
  *
  * Below the returned context, reads and writes of the service `name`
  * resolve against the new label instead of the parent's, so a different
  * implementation can be provided without affecting the parent scope.
  * Passing the same `label` to two `isolate()` calls joins their scopes.
  *
  * @param name — the service name to isolate.
  * @param label — scope label to join; defaults to a fresh unique symbol.
  * @returns a child context whose `name` service resolves in the new scope.
  */
  isolate(name, label) {
    const shadow = Object.create(this[symbols.isolate]);
    shadow[name] = label ?? Symbol(name);
    return this.extend({ [symbols.isolate]: shadow });
  }
  intercept(name, config) {
    const intercept = Object.create(this[symbols.intercept]);
    intercept[name] = config;
    return this.extend({ [symbols.intercept]: intercept });
  }
};
var Service = class Service2 {
  ctx;
  /** Symbol key of an instance method run after construction (class plugins). */
  static init = symbols.init;
  /** Symbol key of the availability predicate passed to `ctx.provide()`. */
  static check = symbols.check;
  /** Symbol key of the phantom intercept-config type parameter. */
  static config = symbols.config;
  /** Symbol key of the call body making a service callable (e.g. `ctx.logger()`). */
  static invoke = symbols.invoke;
  /** Symbol key of the helper deriving an extended service instance. */
  static extend = symbols.extend;
  /** Symbol key of the tracker metadata used for context tracing. */
  static tracker = symbols.tracker;
  /** Symbol key of the intercept-config resolution helper below. */
  static resolveConfig = symbols.resolveConfig;
  /** The service name this instance is registered under. */
  name;
  /**
  * Register this instance as `name` in the current context.
  *
  * Calls `ctx.reflect.provide(name, this, this[Service.check])`, so the
  * service is unregistered automatically when the owning fiber unloads.
  * Services with a `[Service.invoke]` body return a callable instance.
  *
  * @param ctx — the context to register in (stored as `this.ctx`).
  * @param name — the service name; defaults to the static `provide` field.
  */
  constructor(ctx, name) {
    this.ctx = ctx;
    name ??= this.constructor["provide"];
    let self = this;
    const tracker = {
      associate: name,
      property: "ctx"
    };
    if (self[symbols.invoke]) self = createCallable(name, joinPrototype(Object.getPrototypeOf(this), Function.prototype), tracker);
    self.ctx = ctx;
    self.name = name;
    defineProperty(self, symbols.tracker, tracker);
    self.ctx.reflect.provide(name, self, this[symbols.check]);
    return self;
  }
  [symbols.filter](ctx) {
    return ctx[symbols.isolate][this.name] === this.ctx[symbols.isolate][this.name];
  }
  [symbols.extend](props) {
    let self;
    if (this[Service2.invoke]) self = createCallable(this.name, this, this[symbols.tracker]);
    else self = Object.create(this);
    return Object.assign(self, props);
  }
  /**
  * Merge intercept config from ancestors with optional base and head values.
  *
  * Entries added closer to the root apply first; `base` is prepended and
  * `head` appended. Uses `Config.merge` when the service declares one,
  * otherwise a shallow `Object.assign`.
  *
  * @param base — lowest-precedence config merged before all intercepts.
  * @param head — highest-precedence config merged after all intercepts.
  * @returns the merged config.
  */
  [symbols.resolveConfig](base, head) {
    let intercept = this.ctx[Context.intercept];
    const configs = [];
    while (this.name in intercept) {
      if (Object.hasOwn(intercept, this.name)) configs.unshift(intercept[this.name]);
      intercept = Object.getPrototypeOf(intercept);
    }
    if (base) configs.unshift(base);
    if (head) configs.push(head);
    if (this["Config"]?.merge) return this["Config"].merge(...configs);
    else return Object.assign({}, ...configs);
  }
  static [Symbol.hasInstance](instance) {
    if (!instance) return false;
    let constructor = instance.constructor;
    while (constructor) {
      constructor = constructor.prototype?.constructor;
      if (constructor === this) return true;
      constructor &&= Object.getPrototypeOf(constructor);
    }
    return false;
  }
};

// node_modules/@deepseek-ai/schemastery/lib/index.mjs
var kSchema = Symbol.for("schemastery");
var kValidationError2 = Symbol.for("ValidationError");
globalThis.__schemastery_index__ ??= 0;
globalThis.__schemastery_refs__ = void 0;
var ValidationError2 = class extends TypeError {
  options;
  name = "ValidationError";
  constructor(message, options) {
    let prefix = "$";
    for (const segment of options.path || []) if (typeof segment === "string") prefix += "." + segment;
    else if (typeof segment === "number") prefix += "[" + segment + "]";
    else if (typeof segment === "symbol") prefix += `[Symbol(${segment.toString()})]`;
    if (prefix.startsWith(".")) prefix = prefix.slice(1);
    super((prefix === "$" ? "" : `${prefix} `) + message);
    this.options = options;
  }
  static is(error2) {
    return !!error2?.[kValidationError2];
  }
};
Object.defineProperty(ValidationError2.prototype, kValidationError2, { value: true });
var Schema = function(options) {
  const schema = function(data, options2 = {}) {
    return Schema.resolve(data, schema, options2)[0];
  };
  if (options.refs) {
    const refs = mapValues(options.refs, (options2) => new Schema(options2));
    const getRef = (uid) => refs[uid];
    for (const key in refs) {
      const options2 = refs[key];
      options2.sKey = getRef(options2.sKey);
      options2.inner = getRef(options2.inner);
      options2.list = options2.list && options2.list.map(getRef);
      options2.dict = options2.dict && mapValues(options2.dict, getRef);
    }
    return refs[options.uid];
  }
  Object.assign(schema, options);
  if (typeof schema.callback === "string") try {
    schema.callback = new Function("return " + schema.callback)();
  } catch {
  }
  Object.defineProperty(schema, "uid", { value: globalThis.__schemastery_index__++ });
  Object.setPrototypeOf(schema, Schema.prototype);
  schema.meta ||= {};
  schema.toString = schema.toString.bind(schema);
  return schema;
};
Schema.prototype = Object.create(Function.prototype);
Schema.prototype[kSchema] = true;
Object.defineProperty(Schema.prototype, "~standard", { get() {
  return {
    version: 1,
    vendor: "schemastery",
    validate: (value) => {
      try {
        return { value: Schema.resolve(value, this, {})[0] };
      } catch (error2) {
        if (ValidationError2.is(error2)) return { issues: [{
          message: error2.message,
          path: error2.options.path
        }] };
        throw error2;
      }
    }
  };
} });
Schema.ValidationError = ValidationError2;
Schema.prototype.toJSON = function toJSON() {
  if (globalThis.__schemastery_refs__) {
    globalThis.__schemastery_refs__[this.uid] ??= JSON.parse(JSON.stringify({ ...this }));
    return this.uid;
  }
  globalThis.__schemastery_refs__ = { [this.uid]: { ...this } };
  globalThis.__schemastery_refs__[this.uid] = JSON.parse(JSON.stringify({ ...this }));
  const result = {
    uid: this.uid,
    refs: globalThis.__schemastery_refs__
  };
  globalThis.__schemastery_refs__ = void 0;
  return result;
};
Schema.prototype.set = function set(key, value) {
  this.dict[key] = value;
  return this;
};
Schema.prototype.push = function push(value) {
  this.list.push(value);
  return this;
};
function mergeDesc(original, messages) {
  const result = typeof original === "string" ? { "": original } : { ...original };
  for (const locale in messages) {
    const value = messages[locale];
    if (value?.$description || value?.$desc) result[locale] = value.$description || value.$desc;
    else if (typeof value === "string") result[locale] = value;
  }
  return result;
}
function getInner(value) {
  return value?.$value ?? value?.$inner;
}
function extractKeys(data) {
  return filterKeys(data ?? {}, (key) => !key.startsWith("$"));
}
Schema.prototype.i18n = function i18n(messages) {
  const schema = Schema(this);
  const desc = mergeDesc(schema.meta.description, messages);
  if (Object.keys(desc).length) schema.meta.description = desc;
  if (schema.dict) schema.dict = mapValues(schema.dict, (inner, key) => {
    return inner.i18n(mapValues(messages, (data) => getInner(data)?.[key] ?? data?.[key]));
  });
  if (schema.list) schema.list = schema.list.map((inner, index) => {
    return inner.i18n(mapValues(messages, (data = {}) => {
      if (Array.isArray(getInner(data))) return getInner(data)[index];
      if (Array.isArray(data)) return data[index];
      return extractKeys(data);
    }));
  });
  if (schema.inner) schema.inner = schema.inner.i18n(mapValues(messages, (data) => {
    if (getInner(data)) return getInner(data);
    return extractKeys(data);
  }));
  if (schema.sKey) schema.sKey = schema.sKey.i18n(mapValues(messages, (data) => data?.$key));
  return schema;
};
Schema.prototype.extra = function extra(key, value) {
  const schema = Schema(this);
  schema.meta = {
    ...schema.meta,
    [key]: value
  };
  return schema;
};
for (const key of [
  "required",
  "disabled",
  "collapse",
  "hidden",
  "loose"
]) Object.assign(Schema.prototype, { [key](value = true) {
  const schema = Schema(this);
  schema.meta = {
    ...schema.meta,
    [key]: value
  };
  return schema;
} });
Schema.prototype.deprecated = function deprecated() {
  const schema = Schema(this);
  schema.meta.badges ||= [];
  schema.meta.badges.push({
    text: "deprecated",
    type: "danger"
  });
  return schema;
};
Schema.prototype.experimental = function experimental() {
  const schema = Schema(this);
  schema.meta.badges ||= [];
  schema.meta.badges.push({
    text: "experimental",
    type: "warning"
  });
  return schema;
};
Schema.prototype.pattern = function pattern(regexp) {
  const schema = Schema(this);
  const pattern2 = pick(regexp, ["source", "flags"]);
  schema.meta = {
    ...schema.meta,
    pattern: pattern2
  };
  return schema;
};
Schema.prototype.simplify = function simplify(value) {
  if (deepEqual(value, this.meta.default, this.type === "dict")) return null;
  if (isNullable(value)) return value;
  if (this.type === "object" || this.type === "dict") {
    const result = {};
    for (const key in value) {
      const item = (this.type === "object" ? this.dict[key] : this.inner)?.simplify(value[key]);
      if (this.type === "dict" || !isNullable(item)) result[key] = item;
    }
    if (deepEqual(result, this.meta.default, this.type === "dict")) return null;
    return result;
  } else if (this.type === "array" || this.type === "tuple") {
    const result = [];
    value.forEach((value2, index) => {
      const schema = this.type === "array" ? this.inner : this.list[index];
      const item = schema ? schema.simplify(value2) : value2;
      result.push(item);
    });
    return result;
  } else if (this.type === "intersect") {
    const result = {};
    for (const item of this.list) Object.assign(result, item.simplify(value));
    return result;
  } else if (this.type === "union") for (const schema of this.list) try {
    Schema.resolve(value, schema, {});
    return schema.simplify(value);
  } catch {
  }
  return value;
};
Schema.prototype.toString = function toString(inline) {
  return formatters[this.type]?.(this, inline) ?? `Schema<${this.type}>`;
};
Schema.prototype.role = function role(role, extra2) {
  const schema = Schema(this);
  schema.meta = {
    ...schema.meta,
    role,
    extra: extra2
  };
  return schema;
};
for (const key of [
  "default",
  "link",
  "comment",
  "description",
  "max",
  "min",
  "step"
]) Object.assign(Schema.prototype, { [key](value) {
  const schema = Schema(this);
  schema.meta = {
    ...schema.meta,
    [key]: value
  };
  return schema;
} });
var resolvers = {};
Schema.extend = function extend(type, resolve4) {
  resolvers[type] = resolve4;
};
Schema.resolve = function resolve(data, schema, options = {}, strict = false) {
  if (!schema) return [data];
  if (options.ignore?.(data, schema)) return [data];
  if (isNullable(data) && schema.type !== "lazy") {
    if (schema.meta.required) throw new ValidationError2(`missing required value`, options);
    let current = schema;
    let fallback = schema.meta.default;
    while (current?.type === "intersect" && isNullable(fallback)) {
      current = current.list[0];
      fallback = current?.meta.default;
    }
    if (isNullable(fallback)) return [data];
    data = clone2(fallback);
  }
  const callback = resolvers[schema.type];
  if (!callback) throw new ValidationError2(`unsupported type "${schema.type}"`, options);
  try {
    return callback(data, schema, options, strict);
  } catch (error2) {
    if (!schema.meta.loose) throw error2;
    return [schema.meta.default];
  }
};
Schema.from = function from(source) {
  if (isNullable(source)) return Schema.any();
  else if ([
    "string",
    "number",
    "boolean"
  ].includes(typeof source)) return Schema.const(source).required();
  else if (source[kSchema]) return source;
  else if (typeof source === "function") switch (source) {
    case String:
      return Schema.string().required();
    case Number:
      return Schema.number().required();
    case Boolean:
      return Schema.boolean().required();
    case Function:
      return Schema.function().required();
    default:
      return Schema.is(source).required();
  }
  else throw new TypeError(`cannot infer schema from ${source}`);
};
Schema.lazy = function lazy(builder) {
  const toJSON2 = () => {
    if (!schema.inner[kSchema]) {
      schema.inner = schema.builder();
      schema.inner.meta = {
        ...schema.meta,
        ...schema.inner.meta
      };
    }
    return schema.inner.toJSON();
  };
  const schema = new Schema({
    type: "lazy",
    builder,
    inner: { toJSON: toJSON2 }
  });
  return schema;
};
Schema.natural = function natural() {
  return Schema.number().step(1).min(0);
};
Schema.percent = function percent() {
  return Schema.number().step(0.01).min(0).max(1).role("slider");
};
Schema.date = function date() {
  return Schema.union([Schema.is(Date), Schema.transform(Schema.string().role("datetime"), (value, options) => {
    const date2 = new Date(value);
    if (isNaN(+date2)) throw new ValidationError2(`invalid date "${value}"`, options);
    return date2;
  }, true)]);
};
Schema.regExp = function regExp(flag = "") {
  return Schema.union([Schema.is(RegExp), Schema.transform(Schema.string().role("regexp", { flag }), (value, options) => {
    try {
      return new RegExp(value, flag);
    } catch (e) {
      throw new ValidationError2(e.message, options);
    }
  }, true)]);
};
Schema.arrayBuffer = function arrayBuffer(encoding) {
  return Schema.union([
    Schema.is(ArrayBuffer),
    Schema.is(SharedArrayBuffer),
    Schema.transform(Schema.any(), (value, options) => {
      if (Binary.isSource(value)) return Binary.fromSource(value);
      throw new ValidationError2(`expected ArrayBufferSource but got ${value}`, options);
    }, true),
    ...encoding ? [Schema.transform(Schema.string(), (value, options) => {
      try {
        return encoding === "base64" ? Binary.fromBase64(value) : Binary.fromHex(value);
      } catch (e) {
        throw new ValidationError2(e.message, options);
      }
    }, true)] : []
  ]);
};
Schema.extend("lazy", (data, schema, options, strict) => {
  if (!schema.inner[kSchema]) {
    schema.inner = schema.builder();
    schema.inner.meta = {
      ...schema.meta,
      ...schema.inner.meta
    };
  }
  return Schema.resolve(data, schema.inner, options, strict);
});
Schema.extend("any", (data) => {
  return [data];
});
Schema.extend("never", (data, _, options) => {
  throw new ValidationError2(`expected nullable but got ${data}`, options);
});
Schema.extend("const", (data, { value }, options) => {
  if (deepEqual(data, value)) return [value];
  throw new ValidationError2(`expected ${value} but got ${data}`, options);
});
function checkWithinRange(data, meta, description, options, skipMin = false) {
  const { max = Infinity, min = -Infinity } = meta;
  if (data > max) throw new ValidationError2(`expected ${description} <= ${max} but got ${data}`, options);
  if (data < min && !skipMin) throw new ValidationError2(`expected ${description} >= ${min} but got ${data}`, options);
}
Schema.extend("string", (data, { meta }, options) => {
  if (typeof data !== "string") throw new ValidationError2(`expected string but got ${data}`, options);
  if (meta.pattern) {
    const regexp = new RegExp(meta.pattern.source, meta.pattern.flags);
    if (!regexp.test(data)) throw new ValidationError2(`expect string to match regexp ${regexp}`, options);
  }
  checkWithinRange(data.length, meta, "string length", options);
  return [data];
});
function decimalShift(data, digits) {
  const str4 = data.toString();
  if (str4.includes("e")) return data * Math.pow(10, digits);
  const index = str4.indexOf(".");
  if (index === -1) return data * Math.pow(10, digits);
  const frac = str4.slice(index + 1);
  const integer = str4.slice(0, index);
  if (frac.length <= digits) return +(integer + frac.padEnd(digits, "0"));
  return +(integer + frac.slice(0, digits) + "." + frac.slice(digits));
}
function isMultipleOf(data, min, step) {
  step = Math.abs(step);
  if (!/^\d+\.\d+$/.test(step.toString())) return (data - min) % step === 0;
  const index = step.toString().indexOf(".");
  const digits = step.toString().slice(index + 1).length;
  return Math.abs(decimalShift(data, digits) - decimalShift(min, digits)) % decimalShift(step, digits) === 0;
}
Schema.extend("number", (data, { meta }, options) => {
  if (typeof data !== "number") throw new ValidationError2(`expected number but got ${data}`, options);
  checkWithinRange(data, meta, "number", options);
  const { step } = meta;
  if (step && !isMultipleOf(data, meta.min ?? 0, step)) throw new ValidationError2(`expected number multiple of ${step} but got ${data}`, options);
  return [data];
});
Schema.extend("boolean", (data, _, options) => {
  if (typeof data === "boolean") return [data];
  throw new ValidationError2(`expected boolean but got ${data}`, options);
});
Schema.extend("bitset", (data, { bits, meta }, options) => {
  let value = 0, keys = [];
  if (typeof data === "number") {
    value = data;
    for (const key in bits) if (data & bits[key]) keys.push(key);
  } else if (Array.isArray(data)) {
    keys = data;
    for (const key of keys) {
      if (typeof key !== "string") throw new ValidationError2(`expected string but got ${key}`, options);
      if (key in bits) value |= bits[key];
    }
  } else throw new ValidationError2(`expected number or array but got ${data}`, options);
  if (value === meta.default) return [value];
  return [value, keys];
});
Schema.extend("function", (data, _, options) => {
  if (typeof data === "function") return [data];
  throw new ValidationError2(`expected function but got ${data}`, options);
});
Schema.extend("is", (data, { constructor }, options) => {
  if (typeof constructor === "function") {
    if (data instanceof constructor) return [data];
    throw new ValidationError2(`expected ${constructor.name} but got ${data}`, options);
  } else {
    if (isNullable(data)) throw new ValidationError2(`expected ${constructor} but got ${data}`, options);
    let prototype = Object.getPrototypeOf(data);
    while (prototype) {
      if (prototype.constructor?.name === constructor) return [data];
      prototype = Object.getPrototypeOf(prototype);
    }
    throw new ValidationError2(`expected ${constructor} but got ${data}`, options);
  }
});
function property(data, key, schema, options) {
  try {
    const [value, adapted] = Schema.resolve(data[key], schema, {
      ...options,
      path: [...options.path || [], key]
    });
    if (adapted !== void 0) data[key] = adapted;
    return value;
  } catch (e) {
    if (!options?.autofix) throw e;
    delete data[key];
    return schema.meta.default;
  }
}
Schema.extend("array", (data, { inner, meta }, options) => {
  if (!Array.isArray(data)) throw new ValidationError2(`expected array but got ${data}`, options);
  checkWithinRange(data.length, meta, "array length", options, !isNullable(inner.meta.default));
  return [data.map((_, index) => property(data, index, inner, options))];
});
Schema.extend("dict", (data, { inner, sKey }, options, strict) => {
  if (!isPlainObject(data)) throw new ValidationError2(`expected object but got ${data}`, options);
  const result = {};
  for (const key in data) {
    let rKey;
    try {
      rKey = Schema.resolve(key, sKey, options)[0];
    } catch (error2) {
      if (strict) continue;
      throw error2;
    }
    result[rKey] = property(data, key, inner, options);
    data[rKey] = data[key];
    if (key !== rKey) delete data[key];
  }
  return [result];
});
Schema.extend("tuple", (data, { list }, options, strict) => {
  if (!Array.isArray(data)) throw new ValidationError2(`expected array but got ${data}`, options);
  const result = list.map((inner, index) => property(data, index, inner, options));
  if (strict) return [result];
  result.push(...data.slice(list.length));
  return [result];
});
function merge(result, data) {
  for (const key in data) {
    if (key in result) continue;
    result[key] = data[key];
  }
}
Schema.extend("object", (data, { dict }, options, strict) => {
  if (!isPlainObject(data)) throw new ValidationError2(`expected object but got ${data}`, options);
  const result = {};
  for (const key in dict) {
    const value = property(data, key, dict[key], options);
    if (!isNullable(value) || key in data) result[key] = value;
  }
  if (!strict) merge(result, data);
  return [result];
});
Schema.extend("union", (data, { list, toString: toString2 }, options, strict) => {
  const messages = [];
  for (const inner of list) try {
    return Schema.resolve(data, inner, options, strict);
  } catch (error2) {
    messages.push(error2);
  }
  throw new ValidationError2(`expected ${toString2()} but got ${JSON.stringify(data)}`, options);
});
Schema.extend("intersect", (data, { list, toString: toString2 }, options, strict) => {
  if (!list.length) return [data];
  let result;
  for (const inner of list) {
    const value = Schema.resolve(data, inner, options, true)[0];
    if (isNullable(value)) continue;
    if (isNullable(result)) result = value;
    else if (typeof result !== typeof value) throw new ValidationError2(`expected ${toString2()} but got ${JSON.stringify(data)}`, options);
    else if (typeof value === "object") merge(result ??= {}, value);
    else if (result !== value) throw new ValidationError2(`expected ${toString2()} but got ${JSON.stringify(data)}`, options);
  }
  if (!strict && isPlainObject(data)) merge(result, data);
  return [result];
});
Schema.extend("transform", (data, { inner, callback, preserve }, options) => {
  const [result, adapted = data] = Schema.resolve(data, inner, options, true);
  if (preserve) return [callback(result)];
  else return [callback(result), callback(adapted)];
});
var formatters = {};
function defineMethod(name, keys, format) {
  formatters[name] = format;
  Object.assign(Schema, { [name](...args) {
    const schema = new Schema({ type: name });
    keys.forEach((key, index) => {
      switch (key) {
        case "sKey":
          schema.sKey = args[index] ?? Schema.string();
          break;
        case "inner":
          schema.inner = Schema.from(args[index]);
          break;
        case "list":
          schema.list = args[index].map(Schema.from);
          break;
        case "dict":
          schema.dict = mapValues(args[index], Schema.from);
          break;
        case "bits":
          schema.bits = {};
          for (const key2 in args[index]) {
            if (typeof args[index][key2] !== "number") continue;
            schema.bits[key2] = args[index][key2];
          }
          break;
        case "callback": {
          const callback = schema.callback = args[index];
          callback["toJSON"] ||= () => callback.toString();
          break;
        }
        case "constructor": {
          const constructor = schema.constructor = args[index];
          if (typeof constructor === "function") constructor["toJSON"] ||= () => constructor["name"];
          break;
        }
        default:
          schema[key] = args[index];
      }
    });
    if (name === "object" || name === "dict") schema.meta.default = {};
    else if (name === "array" || name === "tuple") schema.meta.default = [];
    else if (name === "bitset") schema.meta.default = 0;
    return schema;
  } });
}
defineMethod("is", ["constructor"], ({ constructor }) => {
  if (typeof constructor === "function") return constructor.name;
  else return constructor;
});
defineMethod("any", [], () => "any");
defineMethod("never", [], () => "never");
defineMethod("const", ["value"], ({ value }) => typeof value === "string" ? JSON.stringify(value) : value);
defineMethod("string", [], () => "string");
defineMethod("number", [], () => "number");
defineMethod("boolean", [], () => "boolean");
defineMethod("bitset", ["bits"], () => "bitset");
defineMethod("function", [], () => "function");
defineMethod("array", ["inner"], ({ inner }) => `${inner.toString(true)}[]`);
defineMethod("dict", ["inner", "sKey"], ({ inner, sKey }) => `{ [key: ${sKey.toString()}]: ${inner.toString()} }`);
defineMethod("tuple", ["list"], ({ list }) => `[${list.map((inner) => inner.toString()).join(", ")}]`);
defineMethod("object", ["dict"], ({ dict }) => {
  if (Object.keys(dict).length === 0) return "{}";
  return `{ ${Object.entries(dict).map(([key, inner]) => {
    return `${key}${inner.meta.required ? "" : "?"}: ${inner.toString()}`;
  }).join(", ")} }`;
});
defineMethod("union", ["list"], ({ list }, inline) => {
  const result = list.map(({ toString: format }) => format()).join(" | ");
  return inline ? `(${result})` : result;
});
defineMethod("intersect", ["list"], ({ list }) => {
  return `${list.map((inner) => inner.toString(true)).join(" & ")}`;
});
defineMethod("transform", [
  "inner",
  "callback",
  "preserve"
], ({ inner }, isInner) => inner.toString(isInner));

// node_modules/@deepseek-ai/dsh-scope/lib/index.js
var NamedEntries = class {
  duplicateError;
  data = /* @__PURE__ */ new Map();
  constructor(duplicateError) {
    this.duplicateError = duplicateError;
  }
  /**
  * Insert one unique name.
  * @param name - name unique within this table.
  * @param value - borrowed value to retain.
  * @returns an idempotent undo that removes only this insertion.
  */
  insert(name, value) {
    const data = this.data;
    if (data.has(name)) throw this.duplicateError(name);
    data.set(name, value);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      data.delete(name);
      if (data.size === 0 && this.data === data) this.data = /* @__PURE__ */ new Map();
    };
  }
  /**
  * Read one named value.
  * @param name - name to resolve.
  * @returns the retained value, or `undefined` when absent.
  */
  get(name) {
    return this.data.get(name);
  }
  /**
  * Test one name for membership.
  * @param name - name to test.
  * @returns whether the table contains that name.
  */
  has(name) {
    return this.data.has(name);
  }
  /**
  * Iterate live names in insertion order.
  * @returns the native live key iterator.
  */
  keys() {
    return this.data.keys();
  }
  /**
  * Iterate live entries in insertion order.
  * @returns the native live entry iterator.
  */
  entries() {
    return this.data.entries();
  }
  /**
  * Iterate live values in insertion order.
  * @returns the native live value iterator.
  */
  values() {
    return this.data.values();
  }
  /**
  * Test whether this table has no entries.
  * @returns whether the table is empty.
  */
  isEmpty() {
    return this.data.size === 0;
  }
};
var AnonymousEntries = class {
  data = /* @__PURE__ */ new Map();
  /**
  * Append one independently owned value.
  * @param value - borrowed value to retain.
  * @returns an idempotent undo for this exact append.
  */
  append(value) {
    const data = this.data;
    const key = Symbol();
    data.set(key, value);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      data.delete(key);
      if (data.size === 0 && this.data === data) this.data = /* @__PURE__ */ new Map();
    };
  }
  /**
  * Iterate live values in insertion order.
  * @returns the native live value iterator.
  */
  values() {
    return this.data.values();
  }
  /**
  * Test whether this table has no entries.
  * @returns whether the table is empty.
  */
  isEmpty() {
    return this.data.size === 0;
  }
};
var ScopedLayers = class {
  createLayer;
  onChange;
  /** The eagerly constructed context-global layer. */
  global;
  scoped = /* @__PURE__ */ new Map();
  constructor(createLayer, onChange) {
    this.createLayer = createLayer;
    this.onChange = onChange;
    this.global = createLayer(void 0);
  }
  /**
  * Read an existing exact-scope overlay. Deliberately chain-blind: callers
  * addressing one scope's OWN contributions (its restrictions, its guards)
  * must not silently pick up an ancestor's — use {@link chainLayers} where
  * inheritance is the point.
  * @param scope - exact scope key; `undefined` denotes no overlay.
  * @returns the existing scoped layer, or `undefined` without creating one.
  */
  peek(scope) {
    if (scope === void 0) return void 0;
    return this.scoped.get(scope);
  }
  /**
  * Existing overlays along the scope's parent chain ({@link scopeChainOf}),
  * farthest ancestor first and the exact scope last, so a caller layering
  * them in order gives the nearest scope the final word.
  * @param scope - viewing scope, or `undefined` for no overlays.
  * @returns the existing layers, nearest last; absent overlays are skipped.
  */
  chainLayers(scope) {
    const layers = [];
    for (const key of scopeChainOf(scope).reverse()) {
      const layer = this.scoped.get(key);
      if (layer !== void 0) layers.push(layer);
    }
    return layers;
  }
  /**
  * Materialize global named entries followed by scope-chain shadows,
  * farthest ancestor first, so the nearest scope's entry wins a name.
  * @param scope - viewing scope, or `undefined` for the global view.
  * @param pick - select the named table from a layer.
  * @returns an insertion-ordered effective map.
  */
  merge(scope, pick2) {
    const merged = new Map(pick2(this.global).entries());
    for (const layer of this.chainLayers(scope)) for (const [name, value] of pick2(layer).entries()) merged.set(name, value);
    return merged;
  }
  /**
  * Attach one synchronous layer mutation to its registration context.
  * @param ctx - context that determines both scope visibility and effect ownership.
  * @param action - atomic mutation returning its synchronous undo.
  * @param options - Cordis effect label and optional change notification.
  * @returns the exact disposer returned by `ctx.effect()`.
  */
  effect(ctx, action, options) {
    const scope = scopeOf(ctx);
    const notify = options.notify ?? true;
    return ctx.effect(function* () {
      let layer;
      let created = false;
      if (scope === void 0) layer = this.global;
      else {
        const existing = this.scoped.get(scope);
        if (existing === void 0) {
          layer = this.createLayer(scope);
          this.scoped.set(scope, layer);
          created = true;
        } else layer = existing;
      }
      let undo;
      try {
        undo = action(layer);
      } catch (error2) {
        if (scope !== void 0 && created && layer.isEmpty()) this.scoped.delete(scope);
        throw error2;
      }
      yield () => {
        undo();
        if (scope !== void 0 && layer.isEmpty()) this.scoped.delete(scope);
        if (notify) this.onChange();
      };
      if (notify) this.onChange();
    }.bind(this), options.label);
  }
};
var kScope = Symbol("dsh.scope");
var carrierKeys = /* @__PURE__ */ new WeakMap();
var scopeParents = /* @__PURE__ */ new WeakMap();
function scopeChainOf(key) {
  const chain = [];
  for (let cursor = key; cursor !== void 0; cursor = scopeParents.get(cursor)) chain.push(cursor);
  return chain;
}
function scopeOf(ctx) {
  return ctx[kScope];
}
function scopeTarget(base, key) {
  const baseFilter = base[Context.filter];
  const carrier = { [Context.filter](ctx) {
    if (baseFilter !== void 0 && !baseFilter.call(base, ctx)) return false;
    const tag = scopeOf(ctx);
    if (tag === void 0) return true;
    for (let cursor = key; cursor !== void 0; cursor = scopeParents.get(cursor)) if (cursor === tag) return true;
    return false;
  } };
  carrierKeys.set(carrier, key);
  return carrier;
}

// node_modules/@deepseek-ai/dsh-llm/lib/index.js
import { createRequire } from "node:module";

// node_modules/@deepseek-ai/dsh-timeout/lib/index.js
var MAX_TIMER_DELAY_MS = 2147483647;

// node_modules/@deepseek-ai/dsh-llm/lib/index.js
function CallId(id) {
  return id;
}
function deepFreeze(value) {
  const seen = /* @__PURE__ */ new WeakSet();
  const pending = [{
    kind: "visit",
    node: value
  }];
  while (pending.length > 0) {
    const task = pending.pop();
    if (task === void 0) continue;
    if (task.kind === "property") {
      pending.push({
        kind: "visit",
        node: task.source[task.key]
      });
      continue;
    }
    const node = task.node;
    if (node === null || typeof node !== "object") continue;
    if (node instanceof AbortSignal) continue;
    if (seen.has(node)) continue;
    seen.add(node);
    Object.freeze(node);
    const keys = Object.keys(node);
    for (let index = keys.length - 1; index >= 0; index--) {
      const key = keys[index];
      if (key === void 0) continue;
      pending.push({
        kind: "property",
        source: node,
        key
      });
    }
  }
  return value;
}
var HarnessError = class extends Error {
  /** Stable machine-routable failure class (e.g. `RATE_LIMIT`); route on this, never by parsing `message`. */
  code;
  constructor(message, code, options) {
    super(message, options);
    this.code = code;
    this.name = new.target.name;
  }
};
var EMPTY_RESPONSE_CODE = "EMPTY_RESPONSE";
var STRUCTURED_CONTEXT_OVERFLOW = new RegExp(String.raw`(?:^|[^a-z0-9])context[\s_-](?:length|window)[\s_-]` + String.raw`(?:exceed(?:ed|s)?|overflow(?:ed)?|limit[\s_-]exceeded)(?:$|[^a-z0-9])`, "i");
var TOO_LARGE_FOR_CONTEXT = new RegExp(String.raw`\b(?:request|prompt|input|messages?)\s+(?:is\s+|are\s+)?` + String.raw`too\s+(?:large|long)\s+for\s+(?:(?:this|the)\s+)?` + String.raw`(?:model(?:'s)?\s+)?context(?:\s+window)?\b`, "i");
var EXCEEDS_MODEL_CONTEXT = new RegExp(String.raw`\b(?:input|prompt|request|messages?)\b.{0,40}` + String.raw`\b(?:exceed(?:s|ed)?|overflows?|is\s+larger\s+than)\b.{0,40}` + String.raw`\b(?:the\s+)?(?:model(?:'s)?\s+)?context(?:\s+(?:length|window))?\b`, "i");
var DEFAULT_MAX_RETRIES = 2;
var DEFAULT_INITIAL_DELAY_MS = 500;
var DEFAULT_MAX_DELAY_MS = 1e4;
var DEFAULT_JITTER_RATIO = 0.1;
var DEFAULT_RETRYABLE_CODES = Object.freeze([
  EMPTY_RESPONSE_CODE,
  "RATE_LIMIT",
  "SERVER",
  "TIMEOUT",
  "TRANSPORT"
]);
var backoffSchema = Schema.object({
  initialDelayMs: Schema.number().max(MAX_TIMER_DELAY_MS).default(DEFAULT_INITIAL_DELAY_MS),
  maxDelayMs: Schema.number().max(MAX_TIMER_DELAY_MS).default(DEFAULT_MAX_DELAY_MS),
  jitterRatio: Schema.number().min(0).max(1).default(DEFAULT_JITTER_RATIO)
});
var normalPolicySchema = Schema.object({
  mode: Schema.const("normal").required(),
  maxRetries: Schema.number().step(1).min(0).max(Number.MAX_SAFE_INTEGER).default(DEFAULT_MAX_RETRIES),
  retryableCodes: Schema.array(Schema.string()).default([...DEFAULT_RETRYABLE_CODES]),
  backoff: backoffSchema
});
var alwaysPolicySchema = Schema.object({
  mode: Schema.const("always").required(),
  backoff: backoffSchema
});
var RetryPolicySchema = Schema.union([normalPolicySchema, alwaysPolicySchema]);
var { version } = createRequire(import.meta.url)("../package.json");
function assertNever(value, context) {
  const rendered = JSON.stringify(value) ?? String(value);
  throw new Error(`unreachable variant${context ? ` in ${context}` : ""}: ${rendered}`);
}

// node_modules/@deepseek-ai/dsh-session/lib/index.js
function hasIntrinsicConstructor(prototype, name) {
  const constructor = Object.getOwnPropertyDescriptor(prototype, "constructor")?.value;
  if (typeof constructor !== "function") return false;
  try {
    return constructor.name === name && constructor.prototype === prototype && Function.prototype.toString.call(constructor) === `function ${name}() { [native code] }`;
  } catch {
    return false;
  }
}
function isIntrinsicObjectPrototype(value) {
  return Object.getPrototypeOf(value) === null && hasIntrinsicConstructor(value, "Object");
}
function hasPlainArrayPrototype(value) {
  const prototype = Object.getPrototypeOf(value);
  if (!Array.isArray(prototype) || !hasIntrinsicConstructor(prototype, "Array")) return false;
  const objectPrototype = Object.getPrototypeOf(prototype);
  return typeof objectPrototype === "object" && objectPrototype !== null && isIntrinsicObjectPrototype(objectPrototype);
}
function hasPlainObjectPrototype(value) {
  const prototype = Object.getPrototypeOf(value);
  return prototype === null || typeof prototype === "object" && isIntrinsicObjectPrototype(prototype);
}
function enumerableStringKeys(value) {
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== "string" || !Object.prototype.propertyIsEnumerable.call(value, key))) return void 0;
  return keys;
}
function walkJsonValue(value, detach) {
  const ancestors = /* @__PURE__ */ new Set();
  let root;
  const assign = (destination, item) => {
    if (destination === void 0) return;
    if (destination.kind === "root") root = item;
    else if (destination.kind === "array") destination.target[destination.index] = item;
    else Object.defineProperty(destination.target, destination.key, {
      value: item,
      enumerable: true,
      configurable: true,
      writable: true
    });
  };
  const tasks = [{
    kind: "visit",
    value,
    ...detach ? { destination: { kind: "root" } } : {}
  }];
  for (let task = tasks.pop(); task !== void 0; task = tasks.pop()) {
    if (task.kind === "leave") {
      ancestors.delete(task.source);
      continue;
    }
    if (task.kind === "array-item") {
      if (!Object.prototype.hasOwnProperty.call(task.source, task.index)) return void 0;
      tasks.push({
        kind: "visit",
        value: task.source[task.index],
        ...task.target === void 0 ? {} : { destination: {
          kind: "array",
          target: task.target,
          index: task.index
        } }
      });
      continue;
    }
    if (task.kind === "object-property") {
      tasks.push({
        kind: "visit",
        value: task.source[task.key],
        ...task.target === void 0 ? {} : { destination: {
          kind: "object",
          target: task.target,
          key: task.key
        } }
      });
      continue;
    }
    const current = task.value;
    if (current === null) {
      assign(task.destination, null);
      continue;
    }
    if (typeof current === "boolean" || typeof current === "string") {
      assign(task.destination, current);
      continue;
    }
    if (typeof current === "number") {
      if (!Number.isFinite(current) || Object.is(current, -0)) return void 0;
      assign(task.destination, current);
      continue;
    }
    if (typeof current !== "object") return void 0;
    if (ancestors.has(current)) return void 0;
    if (Array.isArray(current)) {
      if (!hasPlainArrayPrototype(current)) return void 0;
      const length = current.length;
      if (Reflect.ownKeys(current).length !== length + 1) return void 0;
      const target2 = detach ? [] : void 0;
      if (target2 !== void 0) assign(task.destination, target2);
      ancestors.add(current);
      tasks.push({
        kind: "leave",
        source: current
      });
      for (let index = length - 1; index >= 0; index--) tasks.push({
        kind: "array-item",
        source: current,
        index,
        ...target2 === void 0 ? {} : { target: target2 }
      });
      continue;
    }
    if (!hasPlainObjectPrototype(current)) return void 0;
    const keys = enumerableStringKeys(current);
    if (keys === void 0) return void 0;
    const target = detach ? {} : void 0;
    if (target !== void 0) assign(task.destination, target);
    ancestors.add(current);
    tasks.push({
      kind: "leave",
      source: current
    });
    for (let index = keys.length - 1; index >= 0; index--) {
      const key = keys[index];
      if (key === void 0) return void 0;
      tasks.push({
        kind: "object-property",
        source: current,
        key,
        ...target === void 0 ? {} : { target }
      });
    }
  }
  return detach ? root : true;
}
function snapshotJsonValue(value) {
  return walkJsonValue(value, true);
}
function isJsonValue(value) {
  return walkJsonValue(value, false) === true;
}

// node_modules/@deepseek-ai/dsh-tools/lib/index.js
var JsonSchemaError = class extends HarnessError {
  /** Individual schema violations in walk order. */
  violations;
  constructor(violations) {
    super(`unsupported JSON schema: ${violations.join("; ")}`, "UNSUPPORTED_SCHEMA");
    this.name = "JsonSchemaError";
    this.violations = violations;
  }
};
var CONSTRAINT_KEYWORDS = /* @__PURE__ */ new Set([
  "type",
  "oneOf",
  "properties",
  "required",
  "additionalProperties",
  "items",
  "enum",
  "const"
]);
var ANNOTATION_KEYWORDS = /* @__PURE__ */ new Set([
  "description",
  "title",
  "default",
  "examples"
]);
var SCHEMA_TYPES = [
  "object",
  "array",
  "string",
  "number",
  "integer",
  "boolean",
  "null"
];
function hasIntrinsicConstructor2(prototype, name) {
  const constructor = Object.getOwnPropertyDescriptor(prototype, "constructor")?.value;
  if (typeof constructor !== "function") return false;
  try {
    return constructor.name === name && constructor.prototype === prototype && Function.prototype.toString.call(constructor) === `function ${name}() { [native code] }`;
  } catch {
    return false;
  }
}
function isIntrinsicObjectPrototype2(value) {
  return Object.getPrototypeOf(value) === null && hasIntrinsicConstructor2(value, "Object");
}
function isPlainJsonRecord(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  try {
    const prototype = Object.getPrototypeOf(value);
    return prototype === null || typeof prototype === "object" && isIntrinsicObjectPrototype2(prototype);
  } catch {
    return false;
  }
}
function hasPlainArrayPrototype2(value) {
  const prototype = Object.getPrototypeOf(value);
  if (!Array.isArray(prototype) || !hasIntrinsicConstructor2(prototype, "Array")) return false;
  const objectPrototype = Object.getPrototypeOf(prototype);
  return typeof objectPrototype === "object" && objectPrototype !== null && isIntrinsicObjectPrototype2(objectPrototype);
}
function hasOnlyEnumerableStringKeys(value) {
  try {
    return Reflect.ownKeys(value).every((key) => typeof key === "string" && Object.prototype.propertyIsEnumerable.call(value, key));
  } catch {
    return false;
  }
}
function isJsonSchemaRecord(value) {
  return isPlainJsonRecord(value) && hasOnlyEnumerableStringKeys(value);
}
function isPlainJsonArray(value) {
  if (!Array.isArray(value)) return false;
  try {
    if (!hasPlainArrayPrototype2(value) || Reflect.ownKeys(value).length !== value.length + 1) return false;
    for (let index = 0; index < value.length; index++) if (!Object.hasOwn(value, index)) return false;
    return true;
  } catch {
    return false;
  }
}
function isJsonNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && !Object.is(value, -0);
}
function scalarMatches(type, value) {
  switch (type) {
    case "string":
      return typeof value === "string";
    case "number":
      return isJsonNumber(value);
    case "integer":
      return isJsonNumber(value) && Number.isInteger(value);
    case "boolean":
      return typeof value === "boolean";
    case "null":
      return value === null;
    /* v8 ignore next -- JsonSchemaScalarType is closed; this retains compile-time exhaustiveness. */
    default:
      return assertNever(type, "JsonSchemaType");
  }
}
var ONE_OF_SIBLING_KEYWORDS = [
  "properties",
  "required",
  "additionalProperties",
  "items",
  "enum",
  "const"
];
function checkObjectSchemaTail(node, path, properties, violations) {
  const hasRequired = Object.hasOwn(node, "required");
  const required = hasRequired ? node.required : void 0;
  if (hasRequired) if (!isPlainJsonArray(required) || required.some((entry) => typeof entry !== "string")) violations.push(`${path}.required must be an array of strings`);
  else {
    const declared = isJsonSchemaRecord(properties) ? properties : {};
    for (const key of required) if (!Object.hasOwn(declared, key)) violations.push(`${path}.required names "${key}" which is not in properties`);
  }
  if (Object.hasOwn(node, "additionalProperties") && typeof node.additionalProperties !== "boolean") violations.push(`${path}.additionalProperties must be a boolean`);
}
function checkSchemaNode(root, rootPath, violations, seen) {
  const tasks = [{
    kind: "enter",
    node: root,
    path: rootPath
  }];
  for (let task = tasks.pop(); task !== void 0; task = tasks.pop()) {
    if (task.kind === "leave") {
      seen.delete(task.node);
      continue;
    }
    if (task.kind === "one-of-tail") {
      for (const key of ONE_OF_SIBLING_KEYWORDS) if (Object.hasOwn(task.node, key)) violations.push(`${task.path}.${key} is not supported beside oneOf`);
      continue;
    }
    if (task.kind === "object-tail") {
      checkObjectSchemaTail(task.node, task.path, task.properties, violations);
      continue;
    }
    const { node, path } = task;
    if (!isJsonSchemaRecord(node)) {
      violations.push(`${path} must be a schema object`);
      continue;
    }
    if (seen.has(node)) {
      violations.push(`${path} is circular`);
      continue;
    }
    seen.add(node);
    tasks.push({
      kind: "leave",
      node
    });
    for (const key of Object.keys(node)) {
      if (CONSTRAINT_KEYWORDS.has(key)) continue;
      if (ANNOTATION_KEYWORDS.has(key)) {
        try {
          if (!isJsonValue(node[key])) violations.push(`${path}.${key} annotation must be lossless JSON data`);
        } catch {
          violations.push(`${path}.${key} annotation must be lossless JSON data`);
        }
        continue;
      }
      violations.push(`${path}.${key} is not a supported keyword (subset: type/oneOf/properties/required/additionalProperties/items/enum/const + annotations)`);
    }
    if (Object.hasOwn(node, "description") && typeof node.description !== "string") violations.push(`${path}.description must be a string`);
    if (Object.hasOwn(node, "title") && typeof node.title !== "string") violations.push(`${path}.title must be a string`);
    const hasType = Object.hasOwn(node, "type");
    const hasOneOf = Object.hasOwn(node, "oneOf");
    if (hasType && hasOneOf) {
      violations.push(`${path} cannot declare both type and oneOf`);
      continue;
    }
    if (!hasType && !hasOneOf) {
      for (const key of ONE_OF_SIBLING_KEYWORDS) if (Object.hasOwn(node, key)) violations.push(`${path}.${key} requires type or oneOf`);
      continue;
    }
    if (hasOneOf) {
      const oneOf = node.oneOf;
      tasks.push({
        kind: "one-of-tail",
        node,
        path
      });
      if (!isPlainJsonArray(oneOf) || oneOf.length < 2) violations.push(`${path}.oneOf must be an array of at least two schemas`);
      else for (let index = oneOf.length - 1; index >= 0; index--) tasks.push({
        kind: "enter",
        node: oneOf[index],
        path: `${path}.oneOf[${index}]`
      });
      continue;
    }
    const type = node.type;
    if (typeof type !== "string" || !SCHEMA_TYPES.includes(type)) {
      violations.push(Array.isArray(type) ? `${path}.type must be a single type string (type arrays are not supported)` : `${path}.type must be one of ${SCHEMA_TYPES.join("/")}`);
      continue;
    }
    const schemaType = type;
    for (const [key, types] of Object.entries({
      properties: ["object"],
      required: ["object"],
      additionalProperties: ["object"],
      items: ["array"],
      enum: [
        "string",
        "number",
        "integer",
        "boolean",
        "null"
      ],
      const: [
        "string",
        "number",
        "integer",
        "boolean",
        "null"
      ]
    })) if (Object.hasOwn(node, key) && !types.includes(schemaType)) violations.push(`${path}.${key} is not supported on type "${schemaType}"`);
    switch (schemaType) {
      case "object": {
        const properties = Object.hasOwn(node, "properties") ? node.properties : void 0;
        tasks.push({
          kind: "object-tail",
          node,
          path,
          properties
        });
        if (Object.hasOwn(node, "properties")) if (!isJsonSchemaRecord(properties)) violations.push(`${path}.properties must be an object of schemas`);
        else {
          const entries = Object.entries(properties);
          for (let index = entries.length - 1; index >= 0; index--) {
            const entry = entries[index];
            if (entry === void 0) continue;
            tasks.push({
              kind: "enter",
              node: entry[1],
              path: `${path}.properties.${entry[0]}`
            });
          }
        }
        break;
      }
      case "array":
        if (Object.hasOwn(node, "items")) tasks.push({
          kind: "enter",
          node: node.items,
          path: `${path}.items`
        });
        break;
      case "string":
      case "number":
      case "integer":
      case "boolean":
      case "null": {
        const hasEnum = Object.hasOwn(node, "enum");
        const allowed = hasEnum ? node.enum : void 0;
        const enumValid = isPlainJsonArray(allowed) && allowed.length > 0 && allowed.every((entry) => scalarMatches(schemaType, entry));
        if (hasEnum && !enumValid) violations.push(`${path}.enum must be a non-empty array of ${schemaType} values`);
        const hasConst = Object.hasOwn(node, "const");
        const declaredConst = hasConst ? node.const : void 0;
        const constValid = scalarMatches(schemaType, declaredConst);
        if (hasConst) {
          if (!constValid) violations.push(`${path}.const must be a ${schemaType} value`);
          else if (enumValid && !allowed.includes(declaredConst)) violations.push(`${path}.const must be one of ${path}.enum when both are declared`);
        }
        break;
      }
      /* v8 ignore next -- schemaType was narrowed from the closed SCHEMA_TYPES table above. */
      default:
        assertNever(schemaType, "JsonSchemaType");
    }
  }
}
function assertSupportedJsonSchema(schema) {
  const violations = [];
  checkSchemaNode(schema, "schema", violations, /* @__PURE__ */ new Set());
  if (violations.length > 0) throw new JsonSchemaError(violations);
}
function safelyIsJsonValue(value) {
  try {
    return isJsonValue(value);
  } catch {
    return false;
  }
}
function diagnosticPath(path) {
  return path === "" ? "arguments" : path;
}
function propertyPath(path, key) {
  return path === "" ? key : `${path}.${key}`;
}
function losslessValueViolation(path) {
  return [`"${diagnosticPath(path)}" must be a lossless JSON value`];
}
function appendViolations(target, source) {
  for (const violation of source) target.push(violation);
}
function valueFrame(node, value, path) {
  return {
    node,
    value,
    path,
    catches: false,
    phase: "start",
    children: [],
    childIndex: 0,
    violations: [],
    tailViolations: [],
    matches: 0
  };
}
function checkScalarValue(node, value, path) {
  const allowed = Object.hasOwn(node, "enum") ? node.enum : void 0;
  if (allowed !== void 0 && !allowed.includes(value)) return [`"${diagnosticPath(path)}" must be one of ${JSON.stringify(allowed)}`];
  if (Object.hasOwn(node, "const") && value !== node.const) return [`"${diagnosticPath(path)}" must be ${JSON.stringify(node.const)}`];
  return [];
}
function checkValue(schema, value, path) {
  const frames = [valueFrame(schema, value, path)];
  let rootResult;
  const receive = (result) => {
    const parent = frames.at(-1);
    if (parent === void 0) {
      rootResult = result;
      return;
    }
    if (parent.kind === "oneOf") {
      if (result.length === 0) parent.matches++;
    } else appendViolations(parent.violations, result);
  };
  const finish = (result) => {
    frames.pop();
    receive(result);
  };
  while (frames.length > 0) {
    const frame = frames.at(-1);
    if (frame === void 0) break;
    try {
      if (frame.phase === "children") {
        if (frame.childIndex < frame.children.length) {
          const child = frame.children[frame.childIndex];
          if (child === void 0) throw new Error("missing schema-value child frame");
          frame.childIndex++;
          frames.push(valueFrame(child.node, child.value, child.path));
          continue;
        }
        if (frame.kind === "oneOf") {
          finish(frame.matches === 1 ? [] : [`"${diagnosticPath(frame.path)}" must match exactly one oneOf branch (matched ${frame.matches})`]);
          continue;
        }
        appendViolations(frame.violations, frame.tailViolations);
        if (frame.violations.length > 0) finish(frame.violations);
        else if (frame.kind === "object") finish(safelyIsJsonValue(frame.value) ? [] : [`"${diagnosticPath(frame.path)}" must be a lossless JSON object`]);
        else finish(safelyIsJsonValue(frame.value) ? [] : [`"${diagnosticPath(frame.path)}" must be a dense lossless JSON array`]);
        continue;
      }
      const nodeType = Object.hasOwn(frame.node, "type") ? frame.node.type : void 0;
      frame.catches = !(nodeType !== void 0 && !SCHEMA_TYPES.includes(nodeType));
      const oneOf = Object.hasOwn(frame.node, "oneOf") ? frame.node.oneOf : void 0;
      if (oneOf !== void 0) {
        frame.kind = "oneOf";
        frame.children = Array.from(oneOf, (branch) => ({
          node: branch,
          value: frame.value,
          path: frame.path
        }));
        frame.childIndex = 0;
        frame.matches = 0;
        frame.phase = "children";
        continue;
      }
      if (nodeType === void 0) {
        finish(safelyIsJsonValue(frame.value) ? [] : losslessValueViolation(frame.path));
        continue;
      }
      switch (nodeType) {
        case "object": {
          if (!isPlainJsonRecord(frame.value)) {
            finish([`"${diagnosticPath(frame.path)}" must be an object`]);
            break;
          }
          const properties = Object.hasOwn(frame.node, "properties") ? frame.node.properties ?? {} : {};
          const violations = [];
          const required = Object.hasOwn(frame.node, "required") ? frame.node.required ?? [] : [];
          for (const key of required) if (!Object.hasOwn(frame.value, key) || frame.value[key] === void 0) violations.push(`missing required property "${propertyPath(frame.path, key)}"`);
          const children = [];
          for (const [key, child] of Object.entries(properties)) {
            if (!Object.hasOwn(frame.value, key) || frame.value[key] === void 0) continue;
            children.push({
              node: child,
              value: frame.value[key],
              path: propertyPath(frame.path, key)
            });
          }
          const tailViolations = [];
          if (Object.hasOwn(frame.node, "additionalProperties") && frame.node.additionalProperties === false) {
            for (const key of Object.keys(frame.value)) if (!Object.hasOwn(properties, key)) tailViolations.push(`"${propertyPath(frame.path, key)}" is not a declared property (additionalProperties: false)`);
          }
          frame.kind = "object";
          frame.children = children;
          frame.childIndex = 0;
          frame.violations = violations;
          frame.tailViolations = tailViolations;
          frame.phase = "children";
          break;
        }
        case "array": {
          if (!Array.isArray(frame.value)) {
            finish([`"${diagnosticPath(frame.path)}" must be an array`]);
            break;
          }
          const items = Object.hasOwn(frame.node, "items") ? frame.node.items : void 0;
          const children = items === void 0 ? [] : frame.value.flatMap((entry, index) => [{
            node: items,
            value: entry,
            path: `${frame.path}[${index}]`
          }]);
          frame.kind = "array";
          frame.children = children;
          frame.childIndex = 0;
          frame.violations = [];
          frame.phase = "children";
          break;
        }
        case "string":
          finish(typeof frame.value === "string" ? checkScalarValue(frame.node, frame.value, frame.path) : [`"${diagnosticPath(frame.path)}" must be a string`]);
          break;
        case "number":
          finish(typeof frame.value !== "number" ? [`"${diagnosticPath(frame.path)}" must be a number`] : !isJsonNumber(frame.value) ? [`"${diagnosticPath(frame.path)}" must be a finite JSON number`] : checkScalarValue(frame.node, frame.value, frame.path));
          break;
        case "integer":
          finish(!isJsonNumber(frame.value) || !Number.isInteger(frame.value) ? [`"${diagnosticPath(frame.path)}" must be an integer`] : checkScalarValue(frame.node, frame.value, frame.path));
          break;
        case "boolean":
          finish(typeof frame.value === "boolean" ? checkScalarValue(frame.node, frame.value, frame.path) : [`"${diagnosticPath(frame.path)}" must be a boolean`]);
          break;
        case "null":
          finish(frame.value === null ? checkScalarValue(frame.node, frame.value, frame.path) : [`"${diagnosticPath(frame.path)}" must be null`]);
          break;
        default:
          finish(assertNever(nodeType, "JsonSchemaType"));
      }
    } catch (error2) {
      let failed = frames.pop();
      while (failed !== void 0 && !failed.catches) failed = frames.pop();
      if (failed === void 0) throw error2;
      receive(losslessValueViolation(failed.path));
    }
  }
  return rootResult ?? losslessValueViolation(path);
}
function validateJsonSchemaValue(schema, value, path = "value") {
  return checkValue(schema, value, path);
}
var ANNOTATION_KEYS = [
  "description",
  "title",
  "default",
  "examples"
];
function authorError(message) {
  throw new JsonSchemaError([message]);
}
function copyAnnotations(source, target) {
  if (Object.hasOwn(source, "description")) target.description = source.description;
  if (Object.hasOwn(source, "title")) target.title = source.title;
  if (Object.hasOwn(source, "default")) target.default = source.default;
  if (Object.hasOwn(source, "examples")) target.examples = source.examples;
}
function assertAuthorKeys(source, path, allowed) {
  for (const key of Object.keys(source)) if (!allowed.includes(key)) authorError(`${path}.${key} is not supported by the value schema DSL`);
}
function assignCompiledNode(destination, node) {
  switch (destination.kind) {
    case "root":
      destination.holder.value = node;
      break;
    case "property":
      Object.defineProperty(destination.target, destination.key, {
        value: node,
        enumerable: true,
        configurable: true,
        writable: true
      });
      break;
    case "item":
      destination.target.items = node;
      break;
    case "one-of":
      destination.target[destination.index] = node;
      break;
  }
}
function assignCompiledPropertyMap(destination, compiled) {
  if (destination.kind === "root") destination.holder.value = compiled;
  else destination.target.properties = compiled.properties;
}
function runSchemaCompiler(initial) {
  const seen = /* @__PURE__ */ new Set();
  const tasks = [initial];
  for (let task = tasks.pop(); task !== void 0; task = tasks.pop()) {
    if (task.kind === "leave") {
      seen.delete(task.input);
      continue;
    }
    if (task.kind === "property-map-tail") {
      if (task.required.length > 0) {
        task.compiled.required = task.required;
        if (task.destination.kind === "object") task.destination.target.required = task.required;
      }
      continue;
    }
    if (task.kind === "property") {
      if (!isJsonSchemaRecord(task.property)) authorError(`${task.path} must be a value schema object`);
      if (Object.hasOwn(task.property, "required") && task.property.required !== true) authorError(`${task.path}.required must be true when present`);
      if (Object.hasOwn(task.property, "required") && task.property.required === true) task.required.push(task.key);
      tasks.push({
        kind: "value",
        input: task.property,
        path: task.path,
        allowRequired: true,
        destination: {
          kind: "property",
          target: task.properties,
          key: task.key
        }
      });
      continue;
    }
    if (task.kind === "property-map") {
      if (!isJsonSchemaRecord(task.input)) authorError(`${task.path} must be an object of value schemas`);
      if (seen.has(task.input)) authorError(`${task.path} is circular`);
      seen.add(task.input);
      const compiled = { properties: {} };
      const required = [];
      assignCompiledPropertyMap(task.destination, compiled);
      tasks.push({
        kind: "leave",
        input: task.input
      });
      tasks.push({
        kind: "property-map-tail",
        compiled,
        required,
        destination: task.destination
      });
      const entries = Object.entries(task.input);
      for (let index = entries.length - 1; index >= 0; index--) {
        const entry = entries[index];
        if (entry === void 0) continue;
        tasks.push({
          kind: "property",
          property: entry[1],
          path: `${task.path}.${entry[0]}`,
          key: entry[0],
          properties: compiled.properties,
          required
        });
      }
      continue;
    }
    const { input, path } = task;
    if (!isJsonSchemaRecord(input)) authorError(`${path} must be a value schema object`);
    if (seen.has(input)) authorError(`${path} is circular`);
    seen.add(input);
    const authorKeys = [...ANNOTATION_KEYS, ...task.allowRequired ? ["required"] : []];
    const node = {};
    assignCompiledNode(task.destination, node);
    tasks.push({
      kind: "leave",
      input
    });
    if (Object.hasOwn(input, "oneOf")) {
      assertAuthorKeys(input, path, [
        ...authorKeys,
        "oneOf",
        "type"
      ]);
      if (Object.hasOwn(input, "type")) authorError(`${path} cannot declare both type and oneOf`);
      if (!isPlainJsonArray(input.oneOf)) authorError(`${path}.oneOf must be an array of at least two value schemas`);
      const branches = [];
      node.oneOf = branches;
      copyAnnotations(input, node);
      for (let index = input.oneOf.length - 1; index >= 0; index--) tasks.push({
        kind: "value",
        input: input.oneOf[index],
        path: `${path}.oneOf[${index}]`,
        allowRequired: false,
        destination: {
          kind: "one-of",
          target: branches,
          index
        }
      });
      continue;
    }
    const inputType = Object.hasOwn(input, "type") ? input.type : void 0;
    switch (inputType) {
      case "json":
        assertAuthorKeys(input, path, [...authorKeys, "type"]);
        copyAnnotations(input, node);
        break;
      case "object":
        assertAuthorKeys(input, path, [
          ...authorKeys,
          "type",
          "properties",
          "additionalProperties"
        ]);
        if (!Object.hasOwn(input, "additionalProperties") || typeof input.additionalProperties !== "boolean") authorError(`${path}.additionalProperties must be explicitly true or false`);
        node.type = "object";
        copyAnnotations(input, node);
        node.additionalProperties = input.additionalProperties;
        if (Object.hasOwn(input, "properties")) tasks.push({
          kind: "property-map",
          input: input.properties,
          path: `${path}.properties`,
          destination: {
            kind: "object",
            target: node
          }
        });
        break;
      case "array":
        assertAuthorKeys(input, path, [
          ...authorKeys,
          "type",
          "items"
        ]);
        node.type = "array";
        copyAnnotations(input, node);
        if (Object.hasOwn(input, "items")) tasks.push({
          kind: "value",
          input: input.items,
          path: `${path}.items`,
          allowRequired: false,
          destination: {
            kind: "item",
            target: node
          }
        });
        break;
      case "string":
      case "number":
      case "integer":
      case "boolean":
      case "null":
        assertAuthorKeys(input, path, [
          ...authorKeys,
          "type",
          "enum",
          "const"
        ]);
        node.type = inputType;
        copyAnnotations(input, node);
        if (Object.hasOwn(input, "enum")) {
          if (!isPlainJsonArray(input.enum)) authorError(`${path}.enum must be a non-empty array of scalar values`);
          node.enum = Array.from(input.enum, (entry) => entry);
        }
        if (Object.hasOwn(input, "const")) node.const = input.const;
        break;
      default:
        authorError(`${path}.type must be string/number/integer/boolean/null/array/object/json, or use oneOf`);
    }
  }
}
function compilePropertyMap(input, path) {
  const holder = {};
  runSchemaCompiler({
    kind: "property-map",
    input,
    path,
    destination: {
      kind: "root",
      holder
    }
  });
  return holder.value ?? authorError(`${path} did not compile`);
}
function compileValueSchema(input, path) {
  const holder = {};
  runSchemaCompiler({
    kind: "value",
    input,
    path,
    allowRequired: false,
    destination: {
      kind: "root",
      holder
    }
  });
  return holder.value ?? authorError(`${path} did not compile`);
}
function valueSchemaSpecToJsonSchema(spec) {
  const schema = compileValueSchema(spec, "schema");
  assertSupportedJsonSchema(schema);
  return schema;
}
function parameterSchemaSpecToJsonSchema(spec) {
  const compiled = compilePropertyMap(spec, "parameters");
  const schema = {
    type: "object",
    properties: compiled.properties,
    ...compiled.required === void 0 ? {} : { required: compiled.required }
  };
  assertSupportedJsonSchema(schema);
  return schema;
}
var ToolArgsError = class extends HarnessError {
  /** Individual violations in schema-walk order. */
  violations;
  constructor(violations) {
    super(`invalid arguments: ${violations.join("; ")}`, "INVALID_ARGS");
    this.name = "ToolArgsError";
    this.violations = violations;
  }
};
function defineTool(options) {
  const userExecute = options.execute;
  const userFinalizeContent = options.finalizeContent;
  const userRender = options.output.render;
  const userPresentationMeta = options.output.presentationMeta;
  const userPresentCall = options.presentCall;
  const userPresentResult = options.presentResult;
  const userIsConcurrencySafe = options.isConcurrencySafe;
  if (options.timeoutMs !== void 0 && (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0)) throw new Error(`defineTool(${options.name}): timeoutMs must be a positive finite number`);
  const parameters = parameterSchemaSpecToJsonSchema(options.parameters);
  const outputSchema = valueSchemaSpecToJsonSchema(options.output.schema);
  const validate = (args) => validateJsonSchemaValue(parameters, args, "");
  const tool = {
    name: options.name,
    description: options.description,
    parameters,
    output: {
      schema: outputSchema,
      render(args, value) {
        return userRender(args, value);
      },
      ...userPresentationMeta !== void 0 ? { presentationMeta(args, value) {
        return userPresentationMeta(args, value);
      } } : {}
    },
    ...options.timeoutMs !== void 0 ? { timeoutMs: options.timeoutMs } : {},
    async execute(args, exec) {
      const violations = validate(args);
      if (violations.length > 0) throw new ToolArgsError(violations);
      return userExecute(args, exec);
    }
  };
  if (userFinalizeContent) tool.finalizeContent = (exec, result) => userFinalizeContent(exec, result);
  if (userPresentCall) tool.presentCall = (args) => {
    if (validate(args).length > 0) return void 0;
    return userPresentCall(args);
  };
  if (userPresentResult) tool.presentResult = (args, result) => {
    if (validate(args).length > 0) return void 0;
    return userPresentResult(args, result);
  };
  if (userIsConcurrencySafe) tool.isConcurrencySafe = (args) => {
    if (validate(args).length > 0) return false;
    return userIsConcurrencySafe(args);
  };
  return tool;
}
var RUN_CODE_NAME = "run_code";
var TYPESCRIPT_FLAVOR = {
  description: "Execute a TypeScript program against the available tools. Takes two required arguments: `code`, the BODY of an async function (erasable syntax only; top-level `await` and `return` work), and `description`, a short summary of what the program does. Call tools as `await tools.name(args)` per the declarations in the system prompt. Only what you print or return comes back \u2014 curate it.",
  codeDescription: "The program: the body of an async TypeScript function."
};
var RUN_CODE_FLAVORS = {
  typescript: TYPESCRIPT_FLAVOR,
  python: {
    description: "Execute a Python program against the available tools. Takes two required arguments: `code`, the BODY of an async function (top-level `await` and `return` work), and `description`, a short summary of what the program does. Call tools as `await tools.name(args)` per the declarations in the system prompt. Answer with `print(...)` and/or `return <value>` \u2014 only that comes back, so curate it.",
    codeDescription: "The program: the body of an async Python function."
  }
};
var RUN_CODE_DESCRIPTION_PARAM_DESCRIPTION = 'Clear, concise description of what this program does in active voice, 5-10 words (shown in the UI). Examples: "Count TODO markers across packages"; "Read failing test and its fixture"; "Rename config key in every cordis.yml".';
function resolveFlavor(peekRuntime) {
  const runtime = peekRuntime();
  if (runtime === void 0) return TYPESCRIPT_FLAVOR;
  const flavor = RUN_CODE_FLAVORS[runtime.language];
  if (!Object.hasOwn(RUN_CODE_FLAVORS, runtime.language) || flavor === void 0) {
    const known = Object.keys(RUN_CODE_FLAVORS).map((name) => JSON.stringify(name)).join(", ");
    throw new Error(`dsh-tools: no run_code schema flavor registered for runtime language ${JSON.stringify(runtime.language)} (known: ${known})`);
  }
  return flavor;
}
var CodeRunFailedError = class extends HarnessError {
  constructor(message) {
    super(message, "CODE_RUN_FAILED");
    this.name = "CodeRunFailedError";
  }
};
function jsonNormalizeArgs(value) {
  let snapshot;
  try {
    snapshot = snapshotJsonValue(value);
  } catch (error2) {
    throw new Error(`tool arguments must be lossless JSON: ${error2 instanceof Error ? error2.message : String(error2)}`);
  }
  if (snapshot === void 0) throw new Error("tool arguments must be lossless JSON (call the tool with an arguments object, e.g. `{}`)");
  const logged = snapshotJsonValue(snapshot);
  if (logged === void 0) throw new Error("tool arguments could not be detached for durable logging");
  return {
    dispatched: snapshot,
    logged
  };
}
var JSON_INDENT = "  ";
var MAX_JSON_INDENT_CHARS = 10;
function renderJsonValue(value) {
  const chunks = [];
  const tasks = [{
    kind: "value",
    value,
    depth: 0,
    compact: false
  }];
  for (let task = tasks.pop(); task !== void 0; task = tasks.pop()) {
    if (task.kind === "text") {
      chunks.push(task.text);
      continue;
    }
    const current = task.value;
    if (current === null || typeof current === "boolean" || typeof current === "number") {
      chunks.push(String(current));
      continue;
    }
    if (typeof current === "string") {
      chunks.push(JSON.stringify(current));
      continue;
    }
    const compact = task.compact || (task.depth + 1) * 2 > MAX_JSON_INDENT_CHARS;
    const childDepth = task.depth + 1;
    if (Array.isArray(current)) {
      chunks.push("[");
      if (current.length === 0) {
        chunks.push("]");
        continue;
      }
      tasks.push({
        kind: "text",
        text: compact ? "]" : `
${JSON_INDENT.repeat(task.depth)}]`
      });
      for (let index = current.length - 1; index >= 0; index--) {
        const item = current[index];
        if (item === void 0) throw new Error("cannot render a sparse JSON array");
        tasks.push({
          kind: "value",
          value: item,
          depth: childDepth,
          compact
        });
        tasks.push({
          kind: "text",
          text: compact ? index === 0 ? "" : "," : `${index === 0 ? "\n" : ",\n"}${JSON_INDENT.repeat(childDepth)}`
        });
      }
      continue;
    }
    const keys = Object.keys(current);
    chunks.push("{");
    if (keys.length === 0) {
      chunks.push("}");
      continue;
    }
    tasks.push({
      kind: "text",
      text: compact ? "}" : `
${JSON_INDENT.repeat(task.depth)}}`
    });
    for (let index = keys.length - 1; index >= 0; index--) {
      const key = keys[index];
      if (key === void 0) throw new Error("cannot render a missing JSON object key");
      const item = current[key];
      if (item === void 0) throw new Error("cannot render an undefined JSON object property");
      tasks.push({
        kind: "value",
        value: item,
        depth: childDepth,
        compact
      });
      tasks.push({
        kind: "text",
        text: compact ? `${index === 0 ? "" : ","}${JSON.stringify(key)}:` : `${index === 0 ? "\n" : ",\n"}${JSON_INDENT.repeat(childDepth)}${JSON.stringify(key)}: `
      });
    }
  }
  return chunks.join("");
}
function renderValue(value) {
  return typeof value === "string" ? value : renderJsonValue(value);
}
function createRunCodeTool(registry, options) {
  const { requireRuntime, peekRuntime, maxParallel, shapeDispatchLog } = options;
  const definition = defineTool({
    name: RUN_CODE_NAME,
    description: TYPESCRIPT_FLAVOR.description,
    parameters: {
      code: {
        type: "string",
        required: true,
        description: TYPESCRIPT_FLAVOR.codeDescription
      },
      description: {
        type: "string",
        required: true,
        description: RUN_CODE_DESCRIPTION_PARAM_DESCRIPTION
      }
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          logs: {
            type: "array",
            required: true,
            items: { type: "string" }
          },
          result: { type: "json" }
        }
      },
      render: (_args, value) => {
        const rendered = value.result === void 0 ? "" : renderValue(value.result);
        const parts = [value.logs.join("\n"), rendered].filter((part) => part.length > 0);
        return [{
          type: "text",
          text: parts.length > 0 ? parts.join("\n") : "(run_code completed with no output)"
        }];
      }
    },
    async execute(args, exec) {
      if (args.description.trim().length === 0) throw new Error("invalid description: expected a non-empty string");
      const runtime = requireRuntime();
      const runController = new AbortController();
      const onOuterAbort = () => {
        runController.abort(exec.signal.reason);
      };
      exec.signal.addEventListener("abort", onOuterAbort, { once: true });
      let dispatches = 0;
      const pendingQueue = [];
      const inFlight = /* @__PURE__ */ new Set();
      const logWork = /* @__PURE__ */ new Set();
      const commitQueue = [];
      let exclusiveActive = false;
      let driving = false;
      let driverRun = Promise.resolve();
      let wake;
      const wakeup = () => {
        const release = wake;
        wake = void 0;
        release?.();
      };
      const drive = () => {
        if (driving) return driverRun;
        driving = true;
        driverRun = (async () => {
          try {
            for (; ; ) {
              const signal = new Promise((resolve4) => {
                wake = resolve4;
              });
              const commitHead = commitQueue[0];
              if (commitHead !== void 0 && commitHead.settled) {
                commitQueue.shift();
                await commitHead.commit();
                if (commitHead.mode === "exclusive") exclusiveActive = false;
                continue;
              }
              const head = pendingQueue[0];
              if (head !== void 0) {
                if (runController.signal.aborted) {
                  pendingQueue.shift();
                  head.abandon();
                  continue;
                }
                const mode = head.classify();
                if (!exclusiveActive && (mode === "exclusive" ? inFlight.size === 0 : inFlight.size < maxParallel)) {
                  if (mode === "exclusive") exclusiveActive = true;
                  head.mode = mode;
                  pendingQueue.shift();
                  commitQueue.push(head);
                  await head.start();
                  const flight = head.flight.finally(() => {
                    inFlight.delete(flight);
                    wakeup();
                  });
                  inFlight.add(flight);
                  continue;
                }
              }
              if (pendingQueue.length === 0 && commitQueue.length === 0 && inFlight.size === 0) return;
              await signal;
            }
          } finally {
            driving = false;
            wake = void 0;
          }
        })();
        return driverRun;
      };
      const drainDispatches = async () => {
        await drive();
        while (logWork.size > 0) await Promise.allSettled([...logWork]);
      };
      const runOver = () => runController.signal.aborted;
      const binding = (name) => async (rawArgs) => {
        if (runOver()) throw new Error(`run_code run is over (${String(runController.signal.reason)}); ${name} not dispatched`);
        const normalized = jsonNormalizeArgs(rawArgs);
        const n = ++dispatches;
        const subCallId = CallId(`${String(exec.callId)}:code:${n}`);
        const input = {
          callId: subCallId,
          rootCallId: exec.rootCallId,
          name,
          arguments: normalized.dispatched,
          ...exec.agent ? { agent: exec.agent } : {},
          parent: exec.token,
          signal: runController.signal
        };
        const scheduler = registry[TOOL_RUNTIME_SCHEDULER];
        const outcome = await new Promise((resolve4, reject) => {
          let parked;
          const settle = (result) => {
            resolve4(result.isError ? {
              isError: true,
              message: result.error.message
            } : {
              isError: false,
              value: result.value
            });
            const agent = exec.agent;
            if (agent === void 0) return;
            const task = (async () => {
              const logged = await shapeDispatchLog({
                exec,
                agent,
                subCallId,
                name,
                isError: result.isError,
                content: result.content
              });
              agent.session.append("tool/code-dispatch", {
                rootCallId: exec.rootCallId,
                parentCallId: exec.callId,
                subCallId,
                name,
                arguments: normalized.logged,
                isError: result.isError,
                content: logged
              });
            })().finally(() => {
              logWork.delete(task);
            });
            logWork.add(task);
          };
          pendingQueue.push({
            flight: Promise.resolve(),
            settled: false,
            classify: () => registry.executionMode(input).kind,
            abandon: () => {
              reject(/* @__PURE__ */ new Error(`run_code run is over (${String(runController.signal.reason)}); ${name} tool call abandoned`));
            },
            async start() {
              exec.agent?.session.append("tool/code-dispatch-start", {
                rootCallId: exec.rootCallId,
                parentCallId: exec.callId,
                subCallId,
                name,
                arguments: normalized.logged
              });
              const prepared = await scheduler.prepare(input);
              if (prepared.kind === "dispatch") {
                this.flight = scheduler.dispatch(prepared.exec).then((dispatchOutcome) => {
                  parked = {
                    kind: dispatchOutcome.kind,
                    exec: prepared.exec,
                    result: dispatchOutcome.result
                  };
                  this.settled = true;
                });
                return;
              }
              parked = {
                kind: prepared.kind,
                exec: prepared.exec,
                result: prepared.result
              };
              this.settled = true;
            },
            async commit() {
              if (parked === void 0) return;
              const result = parked.kind === "post-result" ? await scheduler.finalize(parked.exec, parked.result) : scheduler.finish(parked.exec, parked.result);
              for (const context of result.additionalContexts ?? []) exec.deferContext(context);
              if (result.concludesTurn) exec.concludeTurn();
              settle(result);
              while (logWork.size > maxParallel) await Promise.race(logWork);
            }
          });
          wakeup();
          drive();
        });
        if (runOver()) throw new Error(`run_code run is over (${String(runController.signal.reason)}); ${name} result discarded`);
        if (outcome.isError) throw new Error(outcome.message);
        return outcome.value;
      };
      const functions = /* @__PURE__ */ Object.create(null);
      for (const schema of registry.schemas(exec.agent)) {
        if (schema.name === "run_code") continue;
        Object.defineProperty(functions, schema.name, {
          enumerable: true,
          value: binding(schema.name)
        });
      }
      try {
        let result;
        try {
          result = await runtime.run({
            program: args.code,
            bindings: [{
              global: "tools",
              functions,
              errorClass: {
                name: "ToolCallError",
                memberNameProperty: "toolName"
              }
            }],
            signal: runController.signal
          });
        } finally {
          runController.abort("run_code settled");
          await drainDispatches();
        }
        if (result.error) {
          const logsText = result.logs.length > 0 ? `
Captured output:
${result.logs.join("\n")}` : "";
          throw new CodeRunFailedError(`code run failed (${result.error.kind}): ${result.error.message}${logsText}`);
        }
        return {
          logs: result.logs,
          ...result.value !== void 0 ? { result: result.value } : {}
        };
      } finally {
        exec.signal.removeEventListener("abort", onOuterAbort);
      }
    },
    presentCall: (args) => ({
      card: "generic",
      title: args.description,
      kind: "execute",
      rawInput: args.code
    })
  });
  Object.defineProperty(definition, "description", {
    enumerable: true,
    get: () => resolveFlavor(peekRuntime).description
  });
  Object.defineProperty(definition, "parameters", {
    enumerable: true,
    get: () => parameterSchemaSpecToJsonSchema({
      code: {
        type: "string",
        required: true,
        description: resolveFlavor(peekRuntime).codeDescription
      },
      description: {
        type: "string",
        required: true,
        description: RUN_CODE_DESCRIPTION_PARAM_DESCRIPTION
      }
    })
  });
  return definition;
}
var IDENTIFIER$1 = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
function renderKey(name) {
  return IDENTIFIER$1.test(name) ? name : JSON.stringify(name);
}
function pad$1(indent) {
  return "  ".repeat(indent);
}
function docLines$1(description, indent) {
  if (typeof description !== "string" || description.length === 0) return [];
  const collapsed = description.replace(/\s+/g, " ").trim();
  return [`${pad$1(indent)}/** ${collapsed.replaceAll("*/", String.raw`*\/`)} */`];
}
function renderScalar(value) {
  return JSON.stringify(value);
}
function renderConstrainedScalar$1(node, type) {
  const broad = type === "integer" ? "number" : type;
  if (Object.hasOwn(node, "const")) return renderScalar(node.const);
  if (Object.hasOwn(node, "enum")) return node.enum.map(renderScalar).join(" | ");
  return broad;
}
function typeDocumentFrom(parts) {
  return {
    parts,
    containsUnionOrIntersection: parts.some((part) => typeof part === "string" ? part.includes("|") || part.includes("&") : part.containsUnionOrIntersection)
  };
}
function typeDocument(...parts) {
  return typeDocumentFrom(parts);
}
function flattenTypeDocument(document) {
  const chunks = [];
  const tasks = [document];
  for (let task = tasks.pop(); task !== void 0; task = tasks.pop()) {
    if (typeof task === "string") {
      chunks.push(task);
      continue;
    }
    for (let index = task.parts.length - 1; index >= 0; index--) {
      const part = task.parts[index];
      if (part !== void 0) tasks.push(part);
    }
  }
  return chunks.join("");
}
function schemaRenderFrame(node, indent) {
  return {
    node,
    indent,
    phase: "start",
    children: [],
    childIndex: 0,
    childDocuments: [],
    entries: []
  };
}
function renderSupportedSchema(schema, indent) {
  const frames = [schemaRenderFrame(schema, indent)];
  let rootDocument;
  const finish = (document) => {
    frames.pop();
    const parent = frames.at(-1);
    if (parent === void 0) rootDocument = document;
    else parent.childDocuments.push(document);
  };
  while (frames.length > 0) {
    const frame = frames.at(-1);
    if (frame === void 0) break;
    if (frame.phase === "children") {
      if (frame.childIndex < frame.children.length) {
        const child = frame.children[frame.childIndex];
        if (child === void 0) throw new Error("missing schema render child");
        frame.childIndex++;
        frames.push(schemaRenderFrame(child.node, child.indent));
        continue;
      }
      if (frame.kind === "oneOf") {
        const parts2 = [];
        for (let index = 0; index < frame.childDocuments.length; index++) {
          if (index > 0) parts2.push(" | ");
          const child = frame.childDocuments[index];
          if (child !== void 0) parts2.push(child);
        }
        finish(typeDocumentFrom(parts2));
        continue;
      }
      if (frame.kind === "array") {
        const child = frame.childDocuments[0];
        if (child === void 0) throw new Error("missing array item type");
        finish(child.containsUnionOrIntersection ? typeDocument("(", child, ")[]") : typeDocument(child, "[]"));
        continue;
      }
      const required = new Set(frame.node.required);
      const parts = ["{"];
      for (let index = 0; index < frame.entries.length; index++) {
        const entry = frame.entries[index];
        const child = frame.childDocuments[index];
        if (entry === void 0 || child === void 0) throw new Error("missing object property type");
        const [name, prop] = entry;
        for (const line of docLines$1(prop.description, frame.indent + 1)) parts.push("\n", line);
        parts.push("\n", `${pad$1(frame.indent + 1)}${renderKey(name)}${required.has(name) ? "" : "?"}: `, child, ";");
      }
      parts.push("\n", `${pad$1(frame.indent)}}`);
      const declared = typeDocumentFrom(parts);
      finish(frame.node.additionalProperties === false ? declared : typeDocument(declared, " & Record<string, JsonValue>"));
      continue;
    }
    const node = frame.node;
    if (node.oneOf !== void 0) {
      frame.kind = "oneOf";
      frame.children = Array.from(node.oneOf, (child) => ({
        node: child,
        indent: frame.indent
      }));
      frame.childIndex = 0;
      frame.childDocuments = [];
      frame.phase = "children";
      continue;
    }
    if (node.type === void 0) {
      finish(typeDocument("JsonValue"));
      continue;
    }
    switch (node.type) {
      case "string":
      case "number":
      case "integer":
      case "boolean":
      case "null":
        finish(typeDocument(renderConstrainedScalar$1(node, node.type)));
        break;
      case "array":
        if (node.items === void 0) finish(typeDocument("JsonValue[]"));
        else {
          frame.kind = "array";
          frame.children = [{
            node: node.items,
            indent: frame.indent
          }];
          frame.childIndex = 0;
          frame.childDocuments = [];
          frame.phase = "children";
        }
        break;
      case "object": {
        const open2 = node.additionalProperties !== false;
        const entries = Object.entries(node.properties ?? {});
        if (entries.length === 0) finish(typeDocument(open2 ? "Record<string, JsonValue>" : "Record<string, never>"));
        else {
          frame.kind = "object";
          frame.entries = entries;
          frame.children = entries.map(([, child]) => ({
            node: child,
            indent: frame.indent + 1
          }));
          frame.childIndex = 0;
          frame.childDocuments = [];
          frame.phase = "children";
        }
        break;
      }
      /* v8 ignore next -- assertSupportedJsonSchema narrowed this closed type union. */
      default:
        finish(typeDocument("unknown"));
    }
  }
  return rootDocument ?? typeDocument("unknown");
}
function jsonSchemaToTs(schema, indent = 0) {
  try {
    assertSupportedJsonSchema(schema);
    return flattenTypeDocument(renderSupportedSchema(schema, indent));
  } catch {
    return "unknown";
  }
}
var SDK_INSTRUCTIONS$1 = `## Writing code for run_code

\`run_code\` takes two required arguments: \`code\` \u2014 the body of an async TypeScript function (erasable syntax only \u2014 no \`enum\` or namespaces; type annotations are advisory, the code runs type-stripped) \u2014 and \`description\`, a short summary of what the program does. Inside the program:

- Call tools as \`await tools.name(args)\` \u2014 quoted access for exotic names: \`tools["my-tool"](args)\`. Every call resolves to the tool's typed canonical JSON value. Tool arguments must be lossless JSON.
- A FAILED tool call rejects with \`ToolCallError\`, whose \`toolName\` identifies the failed tool and whose \`message\` is human-readable \u2014 \`try/catch\` it to handle and continue.
- Independent read-only calls MAY overlap under \`Promise.all\` (safe calls run concurrently; mutating calls run alone, in submission order). Sequence dependent work with \`await\`.
- Emit results with \`return\` and/or \`console.log(...)\`. ONLY what you print or return comes back to you \u2014 intermediate tool results never enter the conversation, so extract just what you need.

The available tools:`;
function renderToolsSdk(schemas) {
  const sorted = [...schemas].sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  const argsMembers = [];
  const outputMembers = [];
  for (const schema of sorted) {
    argsMembers.push(...docLines$1(schema.description, 1));
    argsMembers.push(`${pad$1(1)}${renderKey(schema.name)}: ${jsonSchemaToTs(schema.parameters, 1)};`);
    outputMembers.push(`${pad$1(1)}${renderKey(schema.name)}: ${jsonSchemaToTs(schema.output, 1)};`);
  }
  return `${SDK_INSTRUCTIONS$1}

\`\`\`ts
type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }

${[
    `interface ToolArgsMap {${argsMembers.length > 0 ? `
${argsMembers.join("\n")}
` : ""}}`,
    `interface ToolOutputMap {${outputMembers.length > 0 ? `
${outputMembers.join("\n")}
` : ""}}`,
    "type ToolName = keyof ToolOutputMap",
    [
      "declare class ToolCallError extends Error {",
      '  readonly name: "ToolCallError";',
      "  readonly toolName: ToolName;",
      "}"
    ].join("\n"),
    [
      "declare const tools: {",
      "  [K in ToolName]: (args: ToolArgsMap[K]) => Promise<ToolOutputMap[K]>;",
      "}"
    ].join("\n")
  ].join("\n\n")}
\`\`\``;
}
var IDENTIFIER = /^[\p{XID_Start}_]\p{XID_Continue}*$/u;
function isBareIdentifier(name) {
  return IDENTIFIER.test(name) && name.normalize("NFKC") === name;
}
var RESERVED = /* @__PURE__ */ new Set([
  "False",
  "None",
  "True",
  "and",
  "as",
  "assert",
  "async",
  "await",
  "break",
  "class",
  "continue",
  "def",
  "del",
  "elif",
  "else",
  "except",
  "finally",
  "for",
  "from",
  "global",
  "if",
  "import",
  "in",
  "is",
  "lambda",
  "nonlocal",
  "not",
  "or",
  "pass",
  "raise",
  "return",
  "try",
  "while",
  "with",
  "yield",
  "__debug__"
]);
var TYPING_ORDER = [
  "Any",
  "Literal",
  "NotRequired",
  "Protocol",
  "TypedDict"
];
function pad(indent) {
  return "    ".repeat(indent);
}
var UNPRINTABLE = /[\u0000-\u0008\u000e-\u001f\u007f-\u009f]/g;
var LONE_SURROGATE = /[\ud800-\udfff]/gu;
function describe(schema) {
  const description = schema.description;
  if (typeof description !== "string") return void 0;
  const collapsed = description.replace(/\s+/g, " ").replace(UNPRINTABLE, (char) => `\\x${char.charCodeAt(0).toString(16).padStart(2, "0")}`).replace(LONE_SURROGATE, (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`).trim();
  return collapsed.length === 0 ? void 0 : collapsed;
}
function docLines(description, indent) {
  const collapsed = describe({ description });
  if (collapsed === void 0) return [];
  const escaped = collapsed.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
  return [`${pad(indent)}"""${escaped}"""`];
}
function camelCase(raw) {
  const joined = raw.split(/[^\p{XID_Continue}]+|_+/u).filter((part) => part.length > 0).map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`).join("").normalize("NFKC");
  return (/^\p{XID_Start}/u.test(joined) ? joined : `Tool${joined}`).normalize("NFKC");
}
var MAX_CLASS_NAME_BASE = 120;
var MAX_LIST_NESTING = 180;
function capClassNameBase(base) {
  if (base.length <= MAX_CLASS_NAME_BASE) return base;
  const capped = base.slice(0, MAX_CLASS_NAME_BASE);
  return /[\uD800-\uDBFF]$/.test(capped) ? capped.slice(0, -1) : capped;
}
function allocateClassName(base, state) {
  const capped = capClassNameBase(base);
  let name = capped;
  if (state.usedClassNames.has(name)) {
    let n = state.nextClassCounter.get(capped) ?? 2;
    while (state.usedClassNames.has(`${capped}${n}`)) n++;
    name = `${capped}${n}`;
    state.nextClassCounter.set(capped, n + 1);
  }
  state.usedClassNames.add(name);
  return name;
}
function childClassName(base, segment) {
  return capClassNameBase(`${base}${segment}`.normalize("NFKC"));
}
function pyScalar(value) {
  if (value === true) return "True";
  if (value === false) return "False";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" && Number.isInteger(value) && !Number.isSafeInteger(value)) return BigInt(value).toString();
  return String(value);
}
function renderConstrainedScalar(node, broad, state) {
  if (node.const !== void 0) {
    state.typing.add("Literal");
    return `Literal[${pyScalar(node.const)}]`;
  }
  if (node.enum !== void 0) {
    state.typing.add("Literal");
    return `Literal[${node.enum.map(pyScalar).join(", ")}]`;
  }
  return broad;
}
function renderType(schema, className, state) {
  const newFrame = (schema2, className2, listDepth) => ({
    schema: schema2,
    className: className2,
    phase: "start",
    listDepth,
    children: [],
    childIndex: 0,
    childTypes: [],
    entries: []
  });
  try {
    assertSupportedJsonSchema(schema);
    const frames = [newFrame(schema, className, 0)];
    let result;
    const finish = (type) => {
      frames.pop();
      const parent = frames.at(-1);
      if (parent === void 0) result = type;
      else parent.childTypes.push(type);
    };
    while (frames.length > 0) {
      const frame = frames.at(-1);
      if (frame === void 0) break;
      if (frame.phase === "children") {
        if (frame.childIndex < frame.children.length) {
          const child = frame.children[frame.childIndex];
          if (child === void 0) throw new Error("missing python render child");
          frame.childIndex++;
          frames.push(newFrame(child.schema, child.className, child.listDepth));
          continue;
        }
        if (frame.kind === "oneOf") {
          let union = "";
          for (const [index, childType] of frame.childTypes.entries()) union = index === 0 ? childType : `${union} | ${childType}`;
          finish(union);
          continue;
        }
        if (frame.kind === "array") {
          finish(`list[${frame.childTypes[0] ?? "Any"}]`);
          continue;
        }
        const node2 = frame.node;
        const name = frame.allocated;
        if (node2 === void 0 || name === void 0) throw new Error("missing typeddict frame state");
        const required = new Set(node2.required);
        const lines = [`class ${name}(TypedDict):`];
        for (let index = 0; index < frame.entries.length; index++) {
          const entry = frame.entries[index];
          const fieldType = frame.childTypes[index];
          if (entry === void 0 || fieldType === void 0) throw new Error("missing typeddict field type");
          const [field, fieldSchema] = entry;
          const description = describe(fieldSchema);
          if (description !== void 0) lines.push(`${pad(1)}# ${description}`);
          if (required.has(field)) lines.push(`${pad(1)}${field}: ${fieldType}`);
          else {
            state.typing.add("NotRequired");
            lines.push(`${pad(1)}${field}: NotRequired[${fieldType}]`);
          }
        }
        if (node2.additionalProperties !== false) lines.push(`${pad(1)}# Additional keys beyond those declared are allowed.`);
        if (lines.length === 1) lines.push(`${pad(1)}pass`);
        state.classes.push(lines.join("\n"));
        finish(name);
        continue;
      }
      frame.phase = "children";
      const node = frame.schema;
      if (node.oneOf !== void 0) {
        frame.kind = "oneOf";
        frame.children = node.oneOf.map((branch, index) => ({
          schema: branch,
          className: childClassName(frame.className, `${index + 1}`),
          listDepth: frame.listDepth
        }));
        continue;
      }
      if (node.type === void 0) {
        state.typing.add("Any");
        finish("Any");
        continue;
      }
      switch (node.type) {
        case "string":
          finish(renderConstrainedScalar(node, "str", state));
          break;
        case "number":
          finish(renderConstrainedScalar(node, "float", state));
          break;
        case "integer":
          finish(renderConstrainedScalar(node, "int", state));
          break;
        case "boolean":
          finish(renderConstrainedScalar(node, "bool", state));
          break;
        case "null":
          finish("None");
          break;
        case "array":
          if (node.items === void 0) {
            state.typing.add("Any");
            finish("list[Any]");
            break;
          }
          if (frame.listDepth >= MAX_LIST_NESTING) {
            state.typing.add("Any");
            finish("Any");
            break;
          }
          frame.kind = "array";
          frame.children = [{
            schema: node.items,
            className: frame.className,
            listDepth: frame.listDepth + 1
          }];
          break;
        case "object": {
          const entries = Object.entries(node.properties ?? {});
          if (className === "" || !entries.every(([name]) => isBareIdentifier(name) && !RESERVED.has(name) && !(name.startsWith("__") && !name.endsWith("__")))) {
            state.typing.add("Any");
            finish("dict[str, Any]");
            break;
          }
          if (entries.length === 0 && node.additionalProperties !== false) {
            state.typing.add("Any");
            finish("dict[str, Any]");
            break;
          }
          frame.kind = "typeddict";
          frame.node = node;
          frame.allocated = allocateClassName(frame.className, state);
          state.typing.add("TypedDict");
          frame.entries = entries;
          frame.children = entries.map(([field, child]) => ({
            schema: child,
            className: childClassName(frame.allocated ?? "", camelCase(field)),
            listDepth: 1
          }));
          break;
        }
        /* v8 ignore next 4 -- assertSupportedJsonSchema narrowed this closed type union. */
        default:
          state.typing.add("Any");
          finish("Any");
      }
    }
    return result ?? "Any";
  } catch {
    state.typing.add("Any");
    return "Any";
  }
}
var SDK_INSTRUCTIONS = `## Writing code for run_code

\`run_code\` takes two required arguments: \`code\` \u2014 the body of an async Python function (top-level \`await\` and \`return\` both work) \u2014 and \`description\`, a short summary of what the program does. At run time exactly two of the names declared below are bound: \`tools\` and \`ToolCallError\`. Everything else is a STATIC STUB describing argument and return types \u2014 in particular the \`TypedDict\` classes do NOT exist at run time, so build arguments as plain \`dict\`/\`list\` JSON values: \`await tools.name({"field": 1})\`, never \`FooArgs(field=1)\`, which raises \`NameError\`. Inside the program:

- Call tools as \`await tools.name(args)\` \u2014 subscript access for exotic, reserved, or underscore-leading names: \`await tools["my-tool"](args)\`. Every call resolves to the tool's typed canonical JSON value (each method's return type below). Tool arguments must be lossless JSON.
- A FAILED tool call raises \`ToolCallError\`, whose \`toolName\` identifies the failed tool and whose message is human-readable \u2014 wrap in \`try/except\` to handle and continue.
- Independent read-only calls MAY overlap under \`asyncio.gather\` (safe calls run concurrently; mutating calls run alone, in submission order). Sequence dependent work with \`await\`.
- Emit the run's answer with \`print(...)\` and/or a top-level \`return <value>\`; the returned value must be lossless JSON. ONLY what you print and the returned value come back \u2014 intermediate tool results never enter the conversation, so extract just what you need.

The available tools:`;
function renderToolsSdkPy(schemas) {
  const sorted = [...schemas].sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  const state = {
    classes: [],
    usedClassNames: /* @__PURE__ */ new Set(),
    nextClassCounter: /* @__PURE__ */ new Map(),
    typing: /* @__PURE__ */ new Set(["Protocol"])
  };
  const members = [];
  let statements = 0;
  for (const schema of sorted) {
    const argType = renderType(schema.parameters, `${camelCase(schema.name)}Args`, state);
    const outputType = renderType(schema.output, `${camelCase(schema.name)}Output`, state);
    if (isBareIdentifier(schema.name) && !RESERVED.has(schema.name) && !schema.name.startsWith("_")) {
      const doc = docLines(schema.description, 2);
      members.push(doc.length > 0 ? `${pad(1)}async def ${schema.name}(self, args: ${argType}) -> ${outputType}:` : `${pad(1)}async def ${schema.name}(self, args: ${argType}) -> ${outputType}: ...`);
      members.push(...doc);
      statements += 1;
    } else {
      members.push(`${pad(1)}# tools[${JSON.stringify(schema.name)}](args: ${argType}) -> ${outputType}`);
      const description = describe(schema);
      if (description !== void 0) members.push(`${pad(1)}#   ${description}`);
    }
  }
  const body = (statements > 0 ? members : [`${pad(1)}pass`, ...members]).join("\n");
  const imports = TYPING_ORDER.filter((symbol) => state.typing.has(symbol));
  const classBlock = state.classes.length > 0 ? `${state.classes.join("\n\n")}

` : "";
  return `${SDK_INSTRUCTIONS}

\`\`\`python
${`from typing import ${imports.join(", ")}

class ToolCallError(Exception):
    toolName: str

${classBlock}class Tools(Protocol):
${body}

tools: Tools`}
\`\`\``;
}
var COLLAPSE_SECTION_ORDER = 99;
var CODE_ONLY_INSTRUCTION = `\`${RUN_CODE_NAME}\` is the only tool you can call directly \u2014 a tool call naming any other tool fails. Reach every tool the SDK declares below from inside the program.`;
var SDK_RENDERERS = {
  typescript: renderToolsSdk,
  python: renderToolsSdkPy
};
var TOOL_RUNTIME_SCHEDULER = Symbol("@deepseek-ai/dsh-tools.scheduler");
var TOOL_ABORTED = "ABORTED";
var TOOL_ABORTED_BEFORE_DISPATCH = "ABORTED_BEFORE_DISPATCH";
var ToolNotFoundError = class extends HarnessError {
  /**
  * @param toolName - the name the caller asked for.
  * @param reachableFrom - how the model reaches this tool instead, when the
  *   name IS visible and only the presentation denies calling it directly.
  *   Omitted for a name that is registered nowhere.
  */
  constructor(toolName, reachableFrom) {
    super(reachableFrom === void 0 ? `unknown tool "${toolName}"` : `unknown tool "${toolName}": ${reachableFrom}`, "UNKNOWN_TOOL");
    this.name = "ToolNotFoundError";
  }
};
var ToolOutputError = class extends HarnessError {
  /** Schema/value violations in validation order. */
  violations;
  constructor(toolName, violations) {
    super(`tool "${toolName}" returned invalid output: ${violations.join("; ")}`, "INVALID_TOOL_OUTPUT");
    this.name = "ToolOutputError";
    this.violations = violations;
  }
};
function projectionError(toolName, projector, error2) {
  return new ToolOutputError(toolName, [`output.${projector} failed: ${errorMessage(error2)}`]);
}
function snapshotProjection(toolName, projector, candidate) {
  try {
    const detached = snapshotJsonValue(candidate);
    if (detached === void 0) throw new ToolOutputError(toolName, [`output.${projector} returned non-lossless JSON`]);
    return detached;
  } catch (error2) {
    if (error2 instanceof ToolOutputError) throw error2;
    throw projectionError(toolName, projector, error2);
  }
}
function snapshotToolValue(toolName, candidate) {
  try {
    const detached = snapshotJsonValue(candidate);
    if (detached === void 0) throw new ToolOutputError(toolName, ["value is not lossless JSON"]);
    return detached;
  } catch (error2) {
    if (error2 instanceof ToolOutputError) throw error2;
    throw new ToolOutputError(toolName, [`value snapshot failed: ${errorMessage(error2)}`]);
  }
}
function errorMessage(error2) {
  try {
    if (error2 instanceof Error) return error2.message;
    if (typeof error2 === "object" && error2 !== null && "message" in error2 && typeof error2.message === "string") return error2.message;
    return String(error2);
  } catch {
    return "<unprintable thrown value>";
  }
}
function failureMessageFromContent(content) {
  const text3 = content.map((block) => block.type === "text" ? block.text : `[${block.type} content]`).join("\n");
  return text3.length > 0 ? text3 : "tool result blocked by post-execute policy";
}
function materializePresentation(candidate) {
  const detached = snapshotJsonValue(candidate);
  if (detached === void 0) throw new TypeError("tool result must be losslessly JSON-serializable");
  return deepFreeze(detached);
}
function errorInfo(error2) {
  try {
    return error2 instanceof HarnessError ? {
      name: error2.name,
      code: error2.code
    } : void 0;
  } catch {
    return;
  }
}
var ToolLayer = class {
  tools;
  restrictions = new AnonymousEntries();
  guards = new AnonymousEntries();
  /**
  * Presentation this scope's agent declared for itself, shadowing the
  * deployment default. One cell rather than an entry table: two answers to
  * "which form does the model see" is a contradiction, not a merge.
  */
  mode;
  constructor(scope) {
    this.tools = new NamedEntries((name) => /* @__PURE__ */ new Error(scope === void 0 ? `tool "${name}" is already registered (for a per-agent variant, register through that agent's \`agent.ctx\` instead)` : `tool "${name}" is already registered in this scope`));
  }
  /** Whether every contribution table in this aggregate layer is empty. */
  isEmpty() {
    return this.tools.isEmpty() && this.restrictions.isEmpty() && this.guards.isEmpty() && this.mode === void 0;
  }
  /** Whether every compiled restriction in this layer admits a global tool name. */
  admits(name) {
    for (const filter of this.restrictions.values()) if (filter.allow !== void 0 && !filter.allow.has(name) || filter.deny !== void 0 && filter.deny.has(name)) return false;
    return true;
  }
  /** First monotonic denial from this layer's live guard registrations. */
  guardReason(exec) {
    for (const guard of this.guards.values()) {
      const reason = guard(exec);
      if (reason !== void 0) return reason;
    }
  }
};
function resolveMaxParallelSubCalls(value) {
  const maxParallelSubCalls = value ?? 10;
  if (!Number.isInteger(maxParallelSubCalls) || maxParallelSubCalls < 1) throw new Error("maxParallelSubCalls must be a positive integer");
  return maxParallelSubCalls;
}
var ToolRuntime = class extends Service {
  static inject = ["systemPrompt"];
  static Config = Schema.object({
    mode: Schema.union([
      "native",
      "code",
      "both"
    ]).default("native"),
    maxParallelSubCalls: Schema.natural().min(1).default(10)
  });
  /** Internal staged view consumed by `dsh-agent-loop`'s parallel scheduler. */
  [TOOL_RUNTIME_SCHEDULER] = {
    prepare: (exec) => this.prepareScheduledExecution(exec),
    dispatch: (exec) => this.dispatchScheduledExecution(exec),
    finalize: (exec, result) => this.finalizeScheduledExecution(exec, result),
    finish: (exec, result) => this.finishScheduledExecution(exec, result)
  };
  /** Context deferred by a running tool body, keyed by its scheduler-owned execution. */
  deferredContexts = /* @__PURE__ */ new WeakMap();
  /** Executions whose tool body declared the current turn complete. */
  concludingExecutions = /* @__PURE__ */ new WeakSet();
  /** Original caller cancellation, kept outside the wrapper-mutable execution object. */
  cancellationStates = /* @__PURE__ */ new WeakMap();
  /** Definition-owned final content transform snapshotted before policy begins. */
  contentFinalizers = /* @__PURE__ */ new WeakMap();
  layers = new ScopedLayers((scope) => new ToolLayer(scope), () => {
    this.ctx.emit("tools/change");
  });
  /** Presentation for scopes that declare none; {@link presentAs} shadows it per scope. */
  defaultMode;
  maxParallelSubCalls;
  /**
  * Reserved presentation transport, kept outside the filterable registration
  * layers. Built on first need rather than at construction: which agents run
  * a code mode is no longer known when the service is constructed, and the
  * transport is stateless beyond its closures over `this`.
  */
  codeTransport;
  constructor(ctx, config = {}) {
    super(ctx, "tools");
    this.defaultMode = config.mode ?? "native";
    this.maxParallelSubCalls = resolveMaxParallelSubCalls(config.maxParallelSubCalls);
    ctx.systemPrompt.tools((context) => this.wireSchemas(context.scope));
    if (this.defaultMode !== "native") {
      ctx.systemPrompt.section(this.collapseSection());
      ctx.systemPrompt.section(this.sdkSection());
    }
  }
  /**
  * The prompt statement of the `code` executor collapse, registered wherever
  * {@link sdkSection} is and rendering empty outside an effective `code`.
  *
  * Every tool contributes its own guidance section naming its tool, none of
  * them qualify how that tool is reached, and they all render before the SDK
  * (orders 100-199 against {@link SDK_SECTION_ORDER}). Without this the model
  * reads a catalog of tools it is told to use and no statement that only
  * `run_code` may be called, so it emits a native call, receives
  * `UNKNOWN_TOOL` for a tool the prompt just declared, and concludes the
  * deployment is inconsistent. {@link COLLAPSE_SECTION_ORDER} places the rule
  * before that guidance rather than after it.
  *
  * `both` renders empty: native calls do execute there, so the rule is false.
  * @returns the section registration.
  */
  collapseSection() {
    return {
      name: "tools:code-only",
      order: COLLAPSE_SECTION_ORDER,
      text: (context) => this.modeFor(context.scope) === "code" ? CODE_ONLY_INSTRUCTION : ""
    };
  }
  /**
  * The generated-SDK prompt section, registered globally by a code-mode
  * deployment and per scope by {@link presentAs}.
  *
  * The body regenerates from the CALLING scope, and renders empty for an
  * agent presenting natively — an agent that opted out under a code-mode
  * deployment still sees the global registration, and an empty section is
  * dropped from the rendered prompt.
  * @returns the section registration.
  */
  sdkSection() {
    return {
      name: "tools:sdk",
      order: 150,
      text: (context) => {
        const mode = this.modeFor(context.scope);
        if (mode === "native") return "";
        const runtime = this.requireCodeRuntime(mode);
        const render = SDK_RENDERERS[runtime.language];
        if (render === void 0) throw new Error(`dsh-tools: no SDK renderer for ${runtime.language}`);
        return render(this.sdkSchemas(context.scope));
      }
    };
  }
  /**
  * The presentation one scope's agent sees: its own declaration, else the
  * deployment default.
  * @param scope - the calling agent, or undefined for the global view.
  * @returns the resolved presentation mode.
  */
  modeFor(scope) {
    const layers = this.layers.chainLayers(scope);
    for (let index = layers.length - 1; index >= 0; index -= 1) {
      const mode = layers[index]?.mode;
      if (mode !== void 0) return mode;
    }
    return this.defaultMode;
  }
  /**
  * The reserved `run_code` transport, built on first need.
  *
  * It never enters the global layer: per-agent restrictions must not remove
  * it, and a scoped registration must not shadow it. The visibility resolver
  * appends it after resolving the filterable global/scoped capability layers,
  * and only for scopes whose mode actually presents it.
  * @returns the shared transport definition.
  */
  requireCodeTransport() {
    this.codeTransport ??= createRunCodeTool(this, {
      requireRuntime: () => this.requireCodeRuntime(this.defaultMode),
      peekRuntime: () => this.ctx.get("codeRuntime"),
      maxParallel: this.maxParallelSubCalls,
      shapeDispatchLog: (dispatch) => this.shapeDispatchLog(dispatch)
    });
    return this.codeTransport;
  }
  /**
  * Present the calling scope's tools in `mode` instead of the deployment
  * default. Nearest scope on the chain wins, so a preset's standing
  * declaration covers every agent joined under it.
  *
  * Scoped only, and one declaration per scope: this is how an agent preset
  * composes Code Mode agents beside native ones in the same process, and a
  * process-global override would be the `mode` config field instead.
  * @param mode - the presentation the covered agents' models see.
  * @returns the exact disposer that restores the deployment default.
  */
  presentAs(mode) {
    const ctx = this.ctx;
    if (scopeOf(ctx) === void 0) throw new Error("tools.presentAs() requires a scoped context (agent.ctx): a context-global presentation is the `mode` config field on the tools row");
    return ctx.effect(function* () {
      yield this.layers.effect(ctx, (layer) => {
        if (layer.mode !== void 0) throw new Error(`tools.presentAs("${mode}") conflicts with "${layer.mode}" already declared for this scope; one composition selects one presentation`);
        layer.mode = mode;
        return () => {
          layer.mode = void 0;
        };
      }, { label: "tools.presentAs()" });
      if (mode !== "native") {
        yield ctx.systemPrompt.section(this.collapseSection());
        yield ctx.systemPrompt.section(this.sdkSection());
      }
    }.bind(this), "tools.presentAs()");
  }
  /**
  * Build one scope's wire schemas and names for prompt-order validation.
  * Restrictions do not make known tools invalid, but a mode collapse does.
  */
  wireSchemas(scope) {
    const view = this.view(scope);
    const mode = this.modeFor(scope);
    if (mode === "native") return {
      schemas: [...view.visible.values()].map((definition) => this.schemaOf(definition, false)),
      knownNames: [...view.knownNames]
    };
    this.requireCodeRuntime(mode);
    const schemas = [...view.visible.values()].map((definition) => this.schemaOf(definition, false));
    if (mode === "code") return {
      schemas: schemas.filter((schema) => schema.name === RUN_CODE_NAME),
      knownNames: [RUN_CODE_NAME]
    };
    return {
      schemas,
      knownNames: [...view.knownNames, RUN_CODE_NAME]
    };
  }
  /**
  * Resolve the code runtime or throw the actionable misconfiguration error.
  * Read at use time (assembly / run_code execution), NOT via static
  * `inject`: an inject entry would hold `ctx.tools` — and every tool plugin
  * behind it — hostage to a code runtime existing even under `mode:
  * 'native'` (the loop's optional-backend idiom, same as
  * `sessionPersistence`).
  *
  * Assembly and `run_code` execution read separately, so the language is not
  * bound to a request. Harmless while one published backend exists — both
  * reads return the same flavor — but a reload that swapped in a second
  * language between them would hand a program written against one SDK to the
  * other. Binding it is deferred until a second backend ships (the first
  * point it is testable); rationale in the
  * [language-dispatch note](../../../../.agents/notes/implemented/feature/2026-07-31-code-mode-language-dispatch.md).
  */
  requireCodeRuntime(mode) {
    const runtime = this.ctx.get("codeRuntime");
    if (!runtime) throw new Error(`dsh-tools: mode "${mode}" requires a code runtime \u2014 load a ctx.codeRuntime implementation (e.g. @deepseek-ai/dsh-code-runtime-worker-thread) or set tools mode to "native"`);
    if (!Object.hasOwn(SDK_RENDERERS, runtime.language)) {
      const known = Object.keys(SDK_RENDERERS).map((name) => JSON.stringify(name)).join(", ");
      throw new Error(`dsh-tools: no SDK renderer registered for runtime language ${JSON.stringify(runtime.language)} (known: ${known})`);
    }
    return runtime;
  }
  /**
  * Register globally or in the calling agent scope. Scoped tools shadow
  * globals; duplicates within one layer and the reserved `run_code` name fail.
  * @param definition - tool schema, execution, and optional finalization/presentation callbacks.
  * @returns the exact disposer that unregisters the tool.
  */
  register(definition) {
    const name = definition.name;
    const output = definition.output;
    if (output === void 0 || typeof output !== "object" || typeof output.render !== "function" || output.presentationMeta !== void 0 && typeof output.presentationMeta !== "function") throw new TypeError(`tool "${name}" must declare output { schema, render, presentationMeta? }`);
    assertSupportedJsonSchema(output.schema);
    const timeoutMs = definition.timeoutMs;
    if (timeoutMs !== void 0 && (!Number.isFinite(timeoutMs) || timeoutMs <= 0)) throw new TypeError(`tool "${name}" timeoutMs must be a positive finite number`);
    if (name === "run_code") throw new Error(`tool name "${RUN_CODE_NAME}" is reserved for the Code Mode presentation transport and cannot be registered or shadowed`);
    return this.layers.effect(this.ctx, (layer) => layer.tools.insert(name, definition), { label: "tools.register()" });
  }
  /**
  * Restrict global tools for the calling agent scope. Empty filters, unknown
  * names, scope-local names, and reserved transport names fail. Restrictions
  * intersect; scoped registrations remain visible.
  * @param filter - global-tool mask: `allow` (keep only) and/or `deny` (remove).
  * @returns the exact disposer that lifts this restriction.
  */
  restrict(filter) {
    const scope = scopeOf(this.ctx);
    if (scope === void 0) throw new Error("tools.restrict() requires a scoped context (agent.ctx): a context-global restriction would mask every agent \u2014 deny the tool for the intended agent instead");
    const allow = filter.allow;
    const deny = filter.deny;
    if (allow === void 0 && deny === void 0) throw new Error("tools.restrict({}) is a no-op: pass `allow` and/or `deny` (an empty filter is almost always a materialized-empty-config bug)");
    const compiled = {
      ...allow !== void 0 ? { allow: new Set(allow) } : {},
      ...deny !== void 0 ? { deny: new Set(deny) } : {}
    };
    if ([...allow ?? [], ...deny ?? []].includes("run_code")) throw new Error(`tools.restrict() cannot name reserved Code Mode presentation transport "${RUN_CODE_NAME}"; restrict end-capability tools instead`);
    const known = this.view(scope).restrictableNames;
    const unknown = [...allow ?? [], ...deny ?? []].filter((name) => !known.has(name));
    if (unknown.length > 0) throw new Error(`tools.restrict() names unknown global tool${unknown.length > 1 ? "s" : ""} ${unknown.map((n) => `"${n}"`).join(", ")}; known global tools: ${[...known].sort().join(", ") || "(none)"}`);
    return this.layers.effect(this.ctx, (layer) => layer.restrictions.append(compiled), { label: "tools.restrict()" });
  }
  /**
  * Register a monotonic guard after the extensible `tools/pre-execute`
  * waterfall. A plain-context guard applies globally; one registered through
  * `agent.ctx` applies only to that agent. Any matching guard may deny by
  * returning a reason, while no guard can force-allow a call another guard
  * denied. The exact effect disposer is returned for ordered ownership and
  * HMR cleanup.
  * @param guard - synchronous check; a returned string denies the execution.
  * @returns the exact disposer that unregisters the guard.
  */
  guard(guard) {
    return this.layers.effect(this.ctx, (layer) => layer.guards.append(guard), {
      label: "tools.guard()",
      notify: false
    });
  }
  /** First monotonic denial from the global then the scope chain's guard layers, farthest first. */
  guardReason(exec) {
    const globalReason = this.layers.global.guardReason(exec);
    if (globalReason !== void 0) return globalReason;
    if (exec.agent === void 0) return void 0;
    for (const layer of this.layers.chainLayers(exec.agent)) {
      const reason = layer.guardReason(exec);
      if (reason !== void 0) return reason;
    }
  }
  /**
  * Resolve every registry fact one scope needs in one layer traversal. The
  * visible map applies restrictions to the INHERITED surface, then the
  * scope's own registrations and the reserved presentation transport; the
  * other sets retain the pre-restriction facts needed by restriction and
  * prompt-order validation.
  *
  * A restriction filters what a scope inherits — the global layer and every
  * ancestor layer on its chain — and never what its OWN layer registers.
  * That exemption is what a per-child capability filter has to keep intact:
  * the delegation runtime registers a child's reporting and structured-output
  * tools into the child's own layer, and a filter naming the capabilities the
  * child may use must not strip the machinery it answers through.
  *
  * Reading the exempt set as "the global layer" instead of "not mine" held
  * only while every model-facing tool sat in the host composition. Once
  * presets moved them onto the agent plane they became an ANCESTOR
  * contribution, so a child's filter silently stopped constraining anything
  * it was given.
  * @param scope - the viewing scope (the agent), or undefined for the global view.
  * @returns the complete derived view for that scope.
  */
  view(scope) {
    const layers = this.layers.chainLayers(scope);
    const own = this.layers.peek(scope);
    const inherited = new Map(this.layers.global.tools.entries());
    for (const layer of layers) {
      if (layer === own) continue;
      for (const [name, definition] of layer.tools.entries()) inherited.set(name, definition);
    }
    const visible = /* @__PURE__ */ new Map();
    const knownNames = /* @__PURE__ */ new Set();
    const restrictableNames = /* @__PURE__ */ new Set();
    for (const [name, definition] of inherited) {
      knownNames.add(name);
      restrictableNames.add(name);
      if (layers.every((layer) => layer.admits(name))) visible.set(name, definition);
    }
    if (own !== void 0) for (const [name, definition] of own.tools.entries()) {
      knownNames.add(name);
      visible.set(name, definition);
    }
    if (this.modeFor(scope) !== "native") visible.set(RUN_CODE_NAME, this.requireCodeTransport());
    return {
      visible,
      knownNames,
      restrictableNames
    };
  }
  /**
  * Look up a tool as one scope sees it (scoped
  * shadows global; a restricted-away global reads as absent). Presenters pass
  * the calling agent so the rendered card matches the definition that
  * actually executed.
  * @param name - the tool name as registered.
  * @param scope - the viewing scope (the agent); omitted = the global view.
  * @returns the definition the scope resolves, or undefined when none is visible.
  */
  get(name, scope) {
    return this.view(scope).visible.get(name);
  }
  /**
  * Resolve the definition that MAY EXECUTE for a call, applying the mode
  * collapse at the operation boundary that owns it. The registry view
  * (`get`) is presentation-agnostic; here a MODEL-DIRECT call under `code`
  * may only name the reserved `run_code` transport, while a nested
  * sub-dispatch (a `parent` token set — the `run_code` SDK calling a tool
  * it bound) may call any visible tool. Denial surfaces as `UNKNOWN_TOOL`
  * through the executor, matching an absent definition.
  * @param name - the tool name as registered.
  * @param scope - the viewing scope (the agent); omitted = the global view.
  * @param nested - whether the call is a transport sub-dispatch, not a model-direct call.
  * @returns the definition that may run, or undefined when the call must be rejected.
  */
  resolveExecution(name, scope, nested) {
    const tool = this.get(name, scope);
    if (tool === void 0) return void 0;
    if (this.collapses(name, scope, nested)) return void 0;
    return tool;
  }
  /**
  * Project visible definitions onto the allowlisted model-facing schema fields,
  * excluding execution and presentation callbacks.
  * @param scope - the viewing scope (the agent); omitted = the global view.
  * @returns one deep-cloned schema per visible tool.
  */
  schemas(scope) {
    return [...this.view(scope).visible.values()].map((definition) => this.schemaOf(definition, true));
  }
  /** Project visible callable tools onto the generated Code Mode SDK contract. */
  sdkSchemas(scope) {
    return [...this.view(scope).visible.values()].filter((definition) => definition.name !== RUN_CODE_NAME).map((definition) => {
      const output = snapshotJsonValue(definition.output.schema);
      if (output === void 0) throw new Error(`tool "${definition.name}" output schema must be lossless JSON before SDK projection`);
      return {
        ...this.schemaOf(definition, true),
        output
      };
    });
  }
  /** Project one definition onto the model-facing schema fields. */
  schemaOf(definition, detachParameters) {
    const { name, description, parameters } = definition;
    const detached = detachParameters ? snapshotJsonValue(parameters) : parameters;
    if (detached === void 0) throw new Error(`tool "${name}" parameters must be lossless JSON before schema projection`);
    return {
      name,
      description,
      parameters: detached
    };
  }
  /**
  * Classify a pending call through the caller's visible tool definition. Only
  * an exact `true` is parallel; unknown, hidden, undeclared, invalid, or
  * throwing classifiers are exclusive.
  * @param exec - call name, parsed arguments, and optional agent scope.
  * @returns the fail-closed scheduling mode.
  */
  executionMode(exec) {
    const tool = this.resolveExecution(exec.name, exec.agent, exec.parent !== void 0);
    if (!tool?.isConcurrencySafe) return { kind: "exclusive" };
    try {
      return tool.isConcurrencySafe(exec.arguments) === true ? { kind: "parallel" } : { kind: "exclusive" };
    } catch {
      return { kind: "exclusive" };
    }
  }
  /**
  * Run the `tools/code-dispatch-log` waterfall over one settled sub-dispatch
  * and return the content the bridge should log on `tool/code-dispatch`.
  * Contained: when a listener throws, the method logs the original settled
  * content; that failure must not fail the dispatch or omit the settle event. Private:
  * the ONE consumer is the `run_code` bridge this registry constructs, which
  * receives it as a capability parameter (the `requireRuntime` idiom) — the
  * waterfall, not this invoker, is the public extension point.
  */
  async shapeDispatchLog(dispatch) {
    try {
      return await this.ctx.waterfall(scopeTarget(this, dispatch.agent), "tools/code-dispatch-log", dispatch, () => Promise.resolve(dispatch.content));
    } catch (error2) {
      this.ctx.logger.warn(`tools: code-dispatch-log listener failed for ${dispatch.name}: ${errorMessage(error2)}; logging the original settled content`);
      return dispatch.content;
    }
  }
  /**
  * Whether the `code` mode collapse denies a model-direct call: only the
  * reserved `run_code` transport may be named. Nested sub-dispatches (a
  * `parent` token set) bypass the collapse. One home for the
  * security-relevant predicate, shared by {@link resolveExecution} and
  * {@link createExecution} so the two can never drift apart.
  *
  * Resolved through {@link modeFor}, NOT `defaultMode`: an agent given `code`
  * by an agent preset under a native deployment is the composition
  * `dsh-agent-tool-presentation` exists for, and reading the deployment default would
  * leave exactly that agent uncollapsed — announcing one surface while
  * executing another, which is the bypass this collapse closes.
  * @param name - the tool name as registered.
  * @param scope - the viewing scope whose effective presentation mode applies.
  * @param nested - whether the call is a transport sub-dispatch, not a model-direct call.
  */
  collapses(name, scope, nested) {
    return !nested && this.modeFor(scope) === "code" && name !== "run_code";
  }
  /**
  * Execute through pre-policy, guards, around-dispatch, post-policy,
  * definition-owned content finalization, and final notification. Tool and
  * listener failures resolve as materialized error results; an invisible tool
  * reports `UNKNOWN_TOOL`. The returned outcome is the same lossless, frozen
  * snapshot final observers receive. Cancellation
  * arriving after entry and before final result materialization skips a
  * not-yet-started body with `ABORTED_BEFORE_DISPATCH` or replaces a
  * successful started outcome with `ABORTED`; already-started work is still
  * drained and may retain a tool-owned structured error.
  * @param exec - the typed same-process call input. The registry assigns its
  *   correlation token before policy begins.
  * @returns the materialized final result.
  */
  async execute(exec) {
    return this.prepareExecution(exec, (prepared) => this.completeScheduledExecution(prepared));
  }
  async completeScheduledExecution(prepared) {
    switch (prepared.kind) {
      case "dispatch": {
        const dispatched = await this.dispatchScheduledExecution(prepared.exec);
        return dispatched.kind === "post-result" ? await this.finalizeScheduledExecution(prepared.exec, dispatched.result) : this.finishScheduledExecution(prepared.exec, dispatched.result);
      }
      case "post-result":
        return await this.finalizeScheduledExecution(prepared.exec, prepared.result);
      case "final-result":
        return this.finishScheduledExecution(prepared.exec, prepared.result);
      /* v8 ignore next -- closed-union exhaustiveness guard */
      default:
        return assertNever(prepared, "scheduled tool preparation");
    }
  }
  createExecution(exec) {
    const deferredContexts = [];
    const token = createExecutionToken();
    const callId = exec.callId;
    const rootCallId = exec.rootCallId ?? callId;
    const name = exec.name;
    const agent = exec.agent;
    const parent = exec.parent;
    const signal = exec.signal;
    const visible = this.get(name, agent);
    const collapsed = visible !== void 0 && this.collapses(name, agent, parent !== void 0);
    const concludingExecutions = this.concludingExecutions;
    const base = {
      token,
      callId,
      rootCallId,
      name,
      signal,
      ...agent !== void 0 ? { agent } : {},
      ...parent !== void 0 ? { parent } : {},
      deferContext(context) {
        deferredContexts.push(context);
      },
      concludeTurn() {
        concludingExecutions.add(this);
      }
    };
    const capturedFinalizer = visible?.finalizeContent?.bind(visible);
    const finalizerFor = () => collapsed && !signal.aborted ? void 0 : capturedFinalizer;
    try {
      const detached = snapshotJsonValue(exec.arguments);
      if (detached === void 0) throw new TypeError("tool execution arguments must be losslessly JSON-serializable");
      const execution = {
        ...base,
        arguments: deepFreeze(detached)
      };
      this.deferredContexts.set(execution, deferredContexts);
      this.contentFinalizers.set(execution, finalizerFor());
      this.cancellationStates.set(execution, {
        callerSignal: signal,
        bodyInvoked: false
      });
      if (collapsed) {
        if (signal.aborted) return {
          kind: "final-result",
          exec: execution,
          result: toolAbortedBeforeDispatchResult()
        };
        return {
          kind: "final-result",
          exec: execution,
          result: toolErrorResult(new ToolNotFoundError(name, `only \`${RUN_CODE_NAME}\` is callable directly \u2014 call \`${name}\` from inside a \`${RUN_CODE_NAME}\` program instead`))
        };
      }
      return {
        kind: "ready",
        exec: execution
      };
    } catch (error2) {
      const execution = {
        ...base,
        arguments: void 0
      };
      this.contentFinalizers.set(execution, finalizerFor());
      return {
        kind: "final-result",
        exec: execution,
        result: toolErrorResult(error2)
      };
    }
  }
  /**
  * Run the ordered pre-execute and monotonic guard stages for the scheduler.
  * @param input - the caller-supplied execution input.
  * @returns the prepared execution plus the next scheduler stage.
  * @internal
  */
  async prepareScheduledExecution(input) {
    return this.prepareExecution(input, (prepared) => prepared);
  }
  async prepareExecution(input, next) {
    const created = this.createExecution(input);
    if (created.kind !== "ready") return next(created);
    const exec = created.exec;
    if (this.callerCancelled(exec)) return next({
      kind: "final-result",
      exec,
      result: toolAbortedBeforeDispatchResult()
    });
    try {
      const carrier = scopeTarget(this, exec.agent);
      const gate = await this.ctx.waterfall(carrier, "tools/pre-execute", exec, () => Promise.resolve({ kind: "allow" }));
      const askResolution = gate.kind === "ask" ? await this.serviceAsk(exec, gate) : {
        decision: gate,
        approvalCancelled: false
      };
      const { decision } = askResolution;
      if (this.callerCancelled(exec) && askResolution.approvalCancelled) return await next({
        kind: "post-result",
        exec,
        result: toolAbortedBeforeDispatchResult()
      });
      const denialReason = decision.kind === "allow" ? this.guardReason(exec) : decision.reason;
      if (denialReason !== void 0) return await next({
        kind: "post-result",
        exec,
        result: this.materializeFinalResult({
          content: [{
            type: "text",
            text: `Error: ${denialReason}`
          }],
          isError: true,
          error: { message: denialReason }
        })
      });
      if (this.callerCancelled(exec)) return await next({
        kind: "post-result",
        exec,
        result: toolAbortedBeforeDispatchResult()
      });
      return await next({
        kind: "dispatch",
        exec
      });
    } catch (error2) {
      return next({
        kind: "final-result",
        exec,
        result: toolErrorResult(error2)
      });
    }
  }
  /** Whether the original caller signal is currently aborted. */
  callerCancelled(exec) {
    const state = this.cancellationStates.get(exec);
    if (state === void 0) throw new Error("tool registry scheduler invariant violated: missing cancellation state");
    return state.callerSignal.aborted;
  }
  /** Canonical cancellation outcome selected by whether the tool body started. */
  cancellationResult(exec, prior) {
    const state = this.cancellationStates.get(exec);
    if (state === void 0) throw new Error("tool registry scheduler invariant violated: missing cancellation state");
    return state.bodyInvoked ? toolAbortedResult(prior) : toolAbortedBeforeDispatchResult(prior);
  }
  /**
  * Dispatch the registered body with the original caller signal fused back
  * into any around-wrapper replacement. Cancellation never abandons the body:
  * a started promise reaches quiescence before its outcome becomes `ABORTED`.
  */
  async dispatchToolBody(exec) {
    const state = this.cancellationStates.get(exec);
    if (state === void 0) throw new Error("tool registry scheduler invariant violated: missing cancellation state");
    const wrapperSignal = exec.signal;
    const fused = fuseToolSignals(state.callerSignal, wrapperSignal);
    const signal = fused.signal;
    if (isAborted(signal)) {
      fused.dispose();
      return toolAbortedBeforeDispatchResult();
    }
    exec.signal = signal;
    try {
      const tool = this.resolveExecution(exec.name, exec.agent, exec.parent !== void 0);
      if (!tool) throw new ToolNotFoundError(exec.name);
      state.bodyInvoked = true;
      const returned = await tool.execute(exec.arguments, exec);
      const result = this.createSuccessResult(exec, tool, returned);
      return isAborted(signal) ? toolAbortedResult(result) : result;
    } catch (error2) {
      return toolErrorResult(error2);
    } finally {
      fused.dispose();
      exec.signal = wrapperSignal;
    }
  }
  /**
  * Run around-dispatch and the tool body. Tool and unknown-tool failures still
  * receive post-execute; pipeline failures are already final.
  * @param exec - the prepared execution.
  * @returns whether the result still needs post-execute.
  * @internal
  */
  async dispatchScheduledExecution(exec) {
    try {
      const mutableExec = exec;
      const carrier = scopeTarget(this, exec.agent);
      const result = await this.ctx.waterfall(carrier, "tools/execute", mutableExec, () => this.dispatchToolBody(mutableExec));
      const normalized = this.normalizeDispatchResult(exec, result);
      const deferredContexts = this.deferredContexts.get(exec);
      if (deferredContexts === void 0) throw new Error("tool registry scheduler invariant violated: unprepared execution");
      const resultWithDeferredContexts = deferredContexts.length === 0 ? normalized : this.markCanonical(exec, {
        ...normalized,
        additionalContexts: [...deferredContexts, ...normalized.additionalContexts ?? []]
      });
      return {
        kind: "post-result",
        result: this.callerCancelled(exec) && !resultWithDeferredContexts.isError ? this.cancellationResult(exec, resultWithDeferredContexts) : resultWithDeferredContexts
      };
    } catch (error2) {
      return {
        kind: "final-result",
        result: toolErrorResult(error2)
      };
    }
  }
  /**
  * Run ordered post-execute, then apply definition-owned content finalization,
  * materialize, and notify the final outcome.
  * @param exec - the prepared execution.
  * @param result - dispatch/pre result that still needs post-execute.
  * @returns the materialized final result.
  * @internal
  */
  async finalizeScheduledExecution(exec, result) {
    try {
      const postResult = await this.postExecute(exec, result);
      return this.finishScheduledExecution(exec, this.callerCancelled(exec) && !postResult.isError ? this.cancellationResult(exec, postResult) : postResult);
    } catch (error2) {
      return this.finishScheduledExecution(exec, toolErrorResult(error2));
    }
  }
  /**
  * Materialize the candidate, apply definition-owned content finalization,
  * then materialize and notify the authoritative result.
  * @param exec - the prepared execution.
  * @param result - final result.
  * @returns the materialized final result.
  * @internal
  */
  finishScheduledExecution(exec, result) {
    let materializedResult;
    try {
      materializedResult = this.materializeFinalResult(result);
    } catch (error2) {
      materializedResult = this.materializeFinalResult(toolErrorResult(error2));
    }
    let finalResult;
    try {
      finalResult = this.materializeFinalResult(this.applyFinalContent(exec, materializedResult));
    } catch (error2) {
      finalResult = this.materializeFinalResult(toolErrorResult(error2));
    }
    this.notifyResult(exec, finalResult);
    return finalResult;
  }
  /** Apply the snapshotted tool-owned content transform without exposing other result fields. */
  applyFinalContent(exec, result) {
    const finalizeContent = this.contentFinalizers.get(exec);
    if (finalizeContent === void 0) return result;
    const content = finalizeContent(exec, result);
    return content === void 0 ? result : {
      ...result,
      content
    };
  }
  /** Notify observers without exposing a mutation or error channel into the outcome. */
  notifyResult(exec, result) {
    Object.freeze(exec);
    const { name: toolName, callId } = exec;
    const reportFailure = (error2) => {
      this.ctx.logger.warn(`tool "${toolName}" (${callId}): tools/result observer failed: ${errorMessage(error2)}`);
    };
    const callbacks = this.ctx.events.dispatch("emit", [
      scopeTarget(this, exec.agent),
      "tools/result",
      exec,
      result
    ]);
    for (const callback of callbacks) try {
      const returned = callback(exec, result);
      Promise.resolve(returned).catch(reportFailure);
    } catch (error2) {
      reportFailure(error2);
    }
  }
  /**
  * Resolve an `ask` decision to allow/deny through the approval seam. The
  * seam is consumed opportunistically with `ctx.get('approval')` — a
  * deployment that composes no ApprovalService keeps the historical degrade
  * to deny, and an unmount mid-session degrades the same way on the next ask.
  * An agent-less execution also degrades: without an agent there is no
  * session to audit to and no UI to route to. Otherwise the outcome maps
  * one-to-one — `allowed-once` proceeds; the three non-grants deny with
  * distinct reasons so the model can tell a human "no" from an absent
  * approval channel.
  */
  async serviceAsk(exec, ask) {
    const approval = this.ctx.get("approval");
    if (approval === void 0) return {
      decision: {
        kind: "deny",
        reason: ask.reason ?? `tool "${exec.name}" requires approval (not yet supported)`
      },
      approvalCancelled: false
    };
    if (exec.agent === void 0) return {
      decision: {
        kind: "deny",
        reason: `tool "${exec.name}" requires approval, but the call has no agent to route it through`
      },
      approvalCancelled: false
    };
    const outcome = await approval.request({
      agent: exec.agent,
      toolName: exec.name,
      callId: exec.callId,
      ...ask.reason !== void 0 ? { reason: ask.reason } : {},
      signal: exec.signal
    });
    switch (outcome) {
      case "allowed-once":
        return {
          decision: { kind: "allow" },
          approvalCancelled: false
        };
      case "rejected":
        return {
          decision: {
            kind: "deny",
            reason: `the user rejected tool "${exec.name}"`
          },
          approvalCancelled: false
        };
      case "cancelled":
        return {
          decision: {
            kind: "deny",
            reason: `approval for tool "${exec.name}" was cancelled`
          },
          approvalCancelled: true
        };
      case "unavailable":
        return {
          decision: {
            kind: "deny",
            reason: `tool "${exec.name}" requires approval, but no approval channel is available`
          },
          approvalCancelled: false
        };
      default:
        return assertNever(outcome, "ApprovalOutcome");
    }
  }
  /**
  * Run the `tools/post-execute` waterfall over a dispatched `result` and apply
  * its {@link PostToolDecision}: `accept` keeps the call successful (replacing
  * `content` when given), `block` turns it into an `isError` whose content is
  * the corrective `feedback`. Either decision may attach `additionalContexts`,
  * which are ferried on the returned result for the loop's active-batch FIFO.
  * Context deferred by the tool body survives an accepted result but is
  * discarded when the outer call is blocked; a block exposes only context the
  * blocking decision explicitly supplied.
  * Runs inside `execute`'s outer try/catch (a throwing listener → isError).
  */
  async postExecute(exec, result) {
    const decision = await this.ctx.waterfall(scopeTarget(this, exec.agent), "tools/post-execute", exec, result, () => Promise.resolve({ kind: "accept" }));
    const decisionContexts = decision.additionalContexts ?? [];
    if (decision.kind === "block") {
      const message = failureMessageFromContent(decision.feedback);
      return this.markCanonical(exec, {
        content: decision.feedback,
        isError: true,
        error: { message },
        ...decisionContexts.length > 0 ? { additionalContexts: decisionContexts } : {}
      });
    }
    if (Object.hasOwn(decision, "content") && Object.hasOwn(decision, "value")) throw new TypeError("tools/post-execute accept decision cannot replace both value and content");
    const additionalContexts = [...result.additionalContexts ?? [], ...decisionContexts];
    if (Object.hasOwn(decision, "value")) {
      if (result.isError) throw new TypeError("tools/post-execute cannot replace the value of a failed result");
      const tool = this.resolveExecution(exec.name, exec.agent, exec.parent !== void 0);
      if (tool === void 0) throw new ToolNotFoundError(exec.name);
      const replaced = this.createSuccessResult(exec, tool, decision.value);
      return this.markCanonical(exec, {
        ...replaced,
        ...additionalContexts.length > 0 ? { additionalContexts } : {}
      });
    }
    return this.markCanonical(exec, {
      ...result,
      ...decision.content !== void 0 ? { content: decision.content } : {},
      ...additionalContexts.length > 0 ? { additionalContexts } : {}
    });
  }
  /** Registry-normalized results and the exact dispatch that validated each value. */
  canonicalResults = /* @__PURE__ */ new WeakMap();
  /** Mark one registry-normalized result as canonical only for its owning dispatch. */
  markCanonical(exec, result) {
    this.canonicalResults.set(result, exec.token);
    return result;
  }
  /** Snapshot, validate, render, and optionally project one successful body value. */
  createSuccessResult(exec, tool, candidate) {
    const detached = snapshotToolValue(tool.name, candidate);
    const violations = validateJsonSchemaValue(tool.output.schema, detached, "value");
    if (violations.length > 0) throw new ToolOutputError(tool.name, violations);
    const value = deepFreeze(detached);
    let rendered;
    try {
      rendered = tool.output.render(exec.arguments, value);
    } catch (error2) {
      throw projectionError(tool.name, "render", error2);
    }
    const content = snapshotProjection(tool.name, "render", rendered);
    let meta;
    if (exec.parent === void 0 && tool.output.presentationMeta !== void 0) {
      let projected;
      try {
        projected = tool.output.presentationMeta(exec.arguments, value);
      } catch (error2) {
        throw projectionError(tool.name, "presentationMeta", error2);
      }
      meta = snapshotProjection(tool.name, "presentationMeta", projected);
    }
    const concludesTurn = this.concludingExecutions.has(exec);
    return this.markCanonical(exec, this.materializeFinalResult({
      isError: false,
      value,
      content,
      ...meta !== void 0 ? { meta } : {},
      ...concludesTurn ? { concludesTurn: true } : {}
    }));
  }
  /** Normalize an around-dispatch wrapper's authored result through the owning output contract. */
  normalizeDispatchResult(exec, result) {
    if (this.canonicalResults.get(result) === exec.token) return result;
    if (result.isError) return this.markCanonical(exec, {
      isError: true,
      error: result.error,
      content: result.content,
      ...result.meta !== void 0 ? { meta: result.meta } : {},
      ...result.additionalContexts !== void 0 ? { additionalContexts: result.additionalContexts } : {}
    });
    const tool = this.resolveExecution(exec.name, exec.agent, exec.parent !== void 0);
    if (tool === void 0) throw new ToolNotFoundError(exec.name);
    const normalized = this.createSuccessResult(exec, tool, result.value);
    return this.markCanonical(exec, {
      ...normalized,
      ...result.additionalContexts !== void 0 ? { additionalContexts: result.additionalContexts } : {}
    });
  }
  /** Materialize the authoritative commit outcome once, immediately before `tools/result`. */
  materializeFinalResult(result) {
    const presentation = {
      content: result.content,
      ...result.meta !== void 0 ? { meta: result.meta } : {},
      ...result.additionalContexts !== void 0 ? { additionalContexts: result.additionalContexts } : {}
    };
    if (result.isError) return materializePresentation({
      isError: true,
      error: result.error,
      ...presentation
    });
    return deepFreeze({
      ...materializePresentation({
        isError: false,
        ...presentation,
        ...result.concludesTurn === true ? { concludesTurn: true } : {}
      }),
      value: result.value
    });
  }
};
function createExecutionToken() {
  return Symbol("dsh.tool.execution");
}
function toolErrorResult(error2) {
  const info = errorInfo(error2);
  const message = errorMessage(error2);
  return {
    content: [{
      type: "text",
      text: `Error: ${message}`
    }],
    isError: true,
    error: {
      message,
      ...info ? { info } : {}
    }
  };
}
function isAborted(signal) {
  return signal.aborted;
}
function fuseToolSignals(caller, wrapper) {
  if (caller === wrapper) return {
    signal: caller,
    dispose() {
    }
  };
  const controller = new AbortController();
  let listening = false;
  const dispose = () => {
    if (!listening) return;
    listening = false;
    caller.removeEventListener("abort", abortFromCaller);
    wrapper.removeEventListener("abort", abortFromWrapper);
  };
  const abortFrom = (source) => {
    const reason = source.reason;
    controller.abort(reason);
    dispose();
  };
  const abortFromCaller = () => {
    abortFrom(caller);
  };
  const abortFromWrapper = () => {
    abortFrom(wrapper);
  };
  if (wrapper.aborted) abortFromWrapper();
  else if (caller.aborted) abortFromCaller();
  else {
    listening = true;
    caller.addEventListener("abort", abortFromCaller, { once: true });
    wrapper.addEventListener("abort", abortFromWrapper, { once: true });
  }
  return {
    signal: controller.signal,
    dispose
  };
}
function toolAbortedResult(prior) {
  const additionalContexts = prior?.additionalContexts ?? [];
  return {
    content: [{
      type: "text",
      text: "Error: tool call aborted"
    }],
    isError: true,
    error: {
      message: "tool call aborted",
      info: {
        name: "AbortError",
        code: TOOL_ABORTED
      }
    },
    ...additionalContexts.length > 0 ? { additionalContexts } : {}
  };
}
function toolAbortedBeforeDispatchResult(prior) {
  const additionalContexts = prior?.additionalContexts ?? [];
  return {
    content: [{
      type: "text",
      text: "Error: tool call aborted before dispatch"
    }],
    isError: true,
    error: {
      message: "tool call aborted before dispatch",
      info: {
        name: "AbortError",
        code: TOOL_ABORTED_BEFORE_DISPATCH
      }
    },
    ...additionalContexts.length > 0 ? { additionalContexts } : {}
  };
}

// src/create-flow.ts
var PLATFORM_OPTIONS = [
  { id: "web", label: "Web" },
  { id: "app", label: "App" },
  { id: "both", label: "Web + App" },
  { id: "mini-program", label: "\u5C0F\u7A0B\u5E8F" },
  { id: "unknown", label: "\u8FD8\u6CA1\u60F3\u597D" },
  { id: "other", label: "\u5176\u4ED6" }
];
var USER_OPTIONS = [
  { id: "consumer", label: "\u666E\u901A\u6D88\u8D39\u8005" },
  { id: "professional", label: "\u4E13\u4E1A\u7528\u6237" },
  { id: "team-member", label: "\u56E2\u961F\u6210\u5458" },
  { id: "administrator", label: "\u7BA1\u7406\u5458" },
  { id: "unknown", label: "\u8FD8\u6CA1\u60F3\u597D" },
  { id: "other", label: "\u5176\u4ED6" }
];
var GOAL_OPTIONS = [
  { id: "query", label: "\u67E5\u8BE2\u4FE1\u606F" },
  { id: "record", label: "\u8BB0\u5F55\u5185\u5BB9" },
  { id: "create", label: "\u521B\u5EFA\u5185\u5BB9" },
  { id: "compare", label: "\u6BD4\u8F83\u548C\u9009\u62E9" },
  { id: "transaction", label: "\u5B8C\u6210\u4EA4\u6613" },
  { id: "unknown", label: "\u8FD8\u6CA1\u60F3\u597D" },
  { id: "other", label: "\u5176\u4ED6" }
];
function includesIdea(idea, pattern2) {
  return pattern2.test(idea);
}
function isSocialIdea(idea) {
  return includesIdea(idea, /陌生人|社交|交友|附近的人|雷达|碰一碰|nfc|好友|聊天/iu);
}
function explicitAnswersFromIdea(idea) {
  const platforms = [];
  if (/小程序/iu.test(idea)) platforms.push("mini-program");
  if (/\bweb\b|网页|网站/iu.test(idea)) platforms.push("web");
  if (/\bapp\b|移动端|手机应用/iu.test(idea)) platforms.push("app");
  if (platforms.length !== 1) return {};
  return {
    "target-platform": {
      questionId: "target-platform",
      values: platforms,
      confirmed: true
    }
  };
}
function goalOptions(idea) {
  if (isSocialIdea(idea)) {
    return [
      { id: "discover-nearby", label: "\u53D1\u73B0\u9644\u8FD1\u7684\u4EBA\u5E76\u5EFA\u7ACB\u8054\u7CFB" },
      { id: "meet-verify", label: "\u7EBF\u4E0B\u89C1\u9762\u540E\u9A8C\u8BC1\u5E76\u6210\u4E3A\u597D\u53CB" },
      { id: "chat-network", label: "\u548C\u5DF2\u5EFA\u7ACB\u8054\u7CFB\u7684\u4EBA\u804A\u5929\u4E92\u52A8" },
      { id: "safety-control", label: "\u5B89\u5168\u5730\u63A7\u5236\u8C01\u53EF\u4EE5\u53D1\u73B0\u548C\u8054\u7CFB\u6211" },
      { id: "unknown", label: "\u8FD8\u6CA1\u60F3\u597D" },
      { id: "other", label: "\u5176\u4ED6" }
    ];
  }
  return GOAL_OPTIONS;
}
function moduleOptions(idea) {
  if (isSocialIdea(idea)) {
    return [
      { id: "radar-home", label: "\u96F7\u8FBE\u9996\u9875\uFF08\u626B\u63CF\u9644\u8FD1\u7684\u4EBA\uFF09" },
      { id: "bump-connect", label: "\u78B0\u4E00\u78B0\u9A8C\u8BC1\u4E0E\u52A0\u597D\u53CB" },
      { id: "friends-chat", label: "\u597D\u53CB\u4E0E\u804A\u5929" },
      { id: "profile-history", label: "\u4E2A\u4EBA\u8D44\u6599\u3001\u96F7\u8FBE\u8DB3\u8FF9\u4E0E\u78B0\u4E00\u78B0\u5386\u53F2" },
      { id: "safety-privacy", label: "\u9690\u79C1\u4E0E\u5B89\u5168\u63A7\u5236" },
      { id: "other", label: "\u5176\u4ED6" }
    ];
  }
  if (includesIdea(idea, /万年历|穿搭|天气|衣橱|服饰/iu)) {
    return [
      { id: "calendar", label: "\u4E07\u5E74\u5386 / \u65E5\u671F\u67E5\u8BE2" },
      { id: "weather", label: "\u5929\u6C14\u4FE1\u606F" },
      { id: "outfit", label: "\u7A7F\u642D\u63A8\u8350" },
      { id: "wardrobe", label: "\u4E2A\u4EBA\u8863\u6A71" },
      { id: "favorite", label: "\u6536\u85CF\u4E0E\u5206\u4EAB" },
      { id: "other", label: "\u5176\u4ED6" }
    ];
  }
  if (includesIdea(idea, /电商|商城|购物|商品|购买/iu)) {
    return [
      { id: "catalog", label: "\u5546\u54C1\u6D4F\u89C8" },
      { id: "search-filter", label: "\u641C\u7D22\u4E0E\u7B5B\u9009" },
      { id: "detail", label: "\u5546\u54C1\u8BE6\u60C5" },
      { id: "cart", label: "\u8D2D\u7269\u8F66" },
      { id: "order", label: "\u8BA2\u5355\u4E0E\u652F\u4ED8" },
      { id: "other", label: "\u5176\u4ED6" }
    ];
  }
  return [
    { id: "home", label: "\u9996\u9875 / \u603B\u89C8" },
    { id: "search-filter", label: "\u641C\u7D22\u4E0E\u7B5B\u9009" },
    { id: "create-edit", label: "\u521B\u5EFA\u4E0E\u7F16\u8F91" },
    { id: "detail", label: "\u8BE6\u60C5\u9875" },
    { id: "profile", label: "\u4E2A\u4EBA\u4E2D\u5FC3" },
    { id: "settings", label: "\u8BBE\u7F6E" },
    { id: "other", label: "\u5176\u4ED6" }
  ];
}
function pageOptions(idea) {
  if (isSocialIdea(idea)) {
    return [
      { id: "radar-home", label: "\u96F7\u8FBE\u9996\u9875" },
      { id: "nearby-profile", label: "\u9644\u8FD1\u7528\u6237\u8D44\u6599\u9875" },
      { id: "bump-confirm", label: "\u78B0\u4E00\u78B0\u9A8C\u8BC1\u9875" },
      { id: "friends-chat", label: "\u597D\u53CB\u4E0E\u804A\u5929\u9875" },
      { id: "profile-history", label: "\u4E2A\u4EBA\u4E2D\u5FC3\u4E0E\u8DB3\u8FF9\u9875" },
      { id: "other", label: "\u5176\u4ED6" }
    ];
  }
  if (includesIdea(idea, /万年历|穿搭|天气|衣橱|服饰/iu)) {
    return [
      { id: "query", label: "\u65E5\u671F / \u57CE\u5E02\u67E5\u8BE2\u9875" },
      { id: "weather", label: "\u65E5\u671F\u4E0E\u5929\u6C14\u9875" },
      { id: "recommendation", label: "\u7A7F\u642D\u63A8\u8350\u7ED3\u679C\u9875" },
      { id: "outfit-detail", label: "\u7A7F\u642D\u8BE6\u60C5\u9875" },
      { id: "wardrobe", label: "\u4E2A\u4EBA\u8863\u6A71\u9875" },
      { id: "other", label: "\u5176\u4ED6" }
    ];
  }
  return [
    { id: "home", label: "\u9996\u9875 / \u603B\u89C8" },
    { id: "core-action", label: "\u6838\u5FC3\u64CD\u4F5C\u9875" },
    { id: "result", label: "\u7ED3\u679C\u9875" },
    { id: "detail", label: "\u8BE6\u60C5\u9875" },
    { id: "profile", label: "\u4E2A\u4EBA\u4E2D\u5FC3" },
    { id: "other", label: "\u5176\u4ED6" }
  ];
}
function flowOptions(idea) {
  if (isSocialIdea(idea)) {
    return [
      { id: "radar-bump-chat", label: "\u96F7\u8FBE\u53D1\u73B0\u9644\u8FD1\u7684\u4EBA \u2192 \u89C1\u9762\u78B0\u4E00\u78B0 \u2192 \u6210\u4E3A\u597D\u53CB \u2192 \u804A\u5929" },
      { id: "radar-profile-meet", label: "\u626B\u63CF\u9644\u8FD1\u7684\u4EBA \u2192 \u67E5\u770B\u8D44\u6599 \u2192 \u51B3\u5B9A\u662F\u5426\u89C1\u9762" },
      { id: "friends-chat", label: "\u8FDB\u5165\u597D\u53CB\u5217\u8868 \u2192 \u9009\u62E9\u597D\u53CB \u2192 \u5F00\u59CB\u804A\u5929" },
      { id: "other", label: "\u5176\u4ED6" }
    ];
  }
  if (includesIdea(idea, /万年历|穿搭|天气|衣橱|服饰/iu)) {
    return [
      { id: "daily-outfit", label: "\u9009\u62E9\u65E5\u671F / \u57CE\u5E02 \u2192 \u83B7\u53D6\u5929\u6C14 \u2192 \u67E5\u770B\u7A7F\u642D\u5EFA\u8BAE" },
      { id: "weather-recommendation", label: "\u67E5\u770B\u5929\u6C14 \u2192 \u76F4\u63A5\u83B7\u5F97\u7A7F\u642D\u5EFA\u8BAE" },
      { id: "wardrobe-match", label: "\u9009\u62E9\u8863\u7269 \u2192 \u751F\u6210\u9002\u5408\u5F53\u5929\u7684\u642D\u914D" },
      { id: "other", label: "\u5176\u4ED6" }
    ];
  }
  return [
    { id: "browse-result", label: "\u8FDB\u5165\u9996\u9875 \u2192 \u6D4F\u89C8\u5185\u5BB9 \u2192 \u67E5\u770B\u7ED3\u679C" },
    { id: "input-result", label: "\u8F93\u5165\u6761\u4EF6 \u2192 \u63D0\u4EA4 \u2192 \u67E5\u770B\u7ED3\u679C" },
    { id: "create-save", label: "\u521B\u5EFA\u5185\u5BB9 \u2192 \u7F16\u8F91 \u2192 \u4FDD\u5B58" },
    { id: "search-detail", label: "\u641C\u7D22 / \u7B5B\u9009 \u2192 \u67E5\u770B\u8BE6\u60C5 \u2192 \u5B8C\u6210\u64CD\u4F5C" },
    { id: "other", label: "\u5176\u4ED6" }
  ];
}
function questionFor(idea, answers) {
  if (answers["target-platform"] === void 0) {
    return {
      id: "target-platform",
      kind: "choice",
      text: "\u4F60\u51C6\u5907\u5148\u505A\u54EA\u4E2A\u7AEF\uFF1F",
      selectionMode: "single",
      options: PLATFORM_OPTIONS,
      allowOther: true
    };
  }
  if (answers["core-user"] === void 0) {
    return {
      id: "core-user",
      kind: "choice",
      text: "\u8FD9\u4E2A\u5DE5\u5177\u4E3B\u8981\u670D\u52A1\u8C01\uFF1F",
      selectionMode: "single",
      options: USER_OPTIONS,
      allowOther: true
    };
  }
  if (answers["core-goal"] === void 0) {
    return {
      id: "core-goal",
      kind: "choice",
      text: "\u9996\u7248\u6700\u91CD\u8981\u7684\u662F\u5E2E\u52A9\u7528\u6237\u5B8C\u6210\u4EC0\u4E48\uFF1F",
      selectionMode: "single",
      options: goalOptions(idea),
      allowOther: true
    };
  }
  if (answers["core-flow"] === void 0) {
    return {
      id: "core-flow",
      kind: "choice",
      text: "\u7528\u6237\u6700\u91CD\u8981\u7684\u4E00\u6761\u4F7F\u7528\u6D41\u7A0B\u662F\u4EC0\u4E48\uFF1F",
      selectionMode: "single",
      options: flowOptions(idea),
      allowOther: true
    };
  }
  if (answers["core-modules"] === void 0) {
    return {
      id: "core-modules",
      kind: "choice",
      text: "\u7B2C\u4E00\u7248\u9700\u8981\u5305\u542B\u54EA\u4E9B\u6838\u5FC3\u6A21\u5757\uFF1F\u53EF\u4EE5\u591A\u9009\u3002",
      selectionMode: "multiple",
      options: moduleOptions(idea),
      allowOther: true,
      minSelections: 1,
      maxSelections: 5
    };
  }
  if (answers["core-pages"] === void 0) {
    return {
      id: "core-pages",
      kind: "choice",
      text: "\u9996\u8F6E\u539F\u578B\u8981\u753B\u54EA\u4E9B\u6838\u5FC3\u9875\u9762\uFF1F\u8BF7\u9009\u62E9 3\u20135 \u4E2A\u3002",
      selectionMode: "multiple",
      options: pageOptions(idea),
      allowOther: true,
      minSelections: 3,
      maxSelections: 5
    };
  }
  return null;
}
function questionById(idea, questionId) {
  const questions = [
    questionFor(idea, {}),
    questionFor(idea, { "target-platform": { questionId: "target-platform", values: ["web"], confirmed: true } }),
    questionFor(idea, {
      "target-platform": { questionId: "target-platform", values: ["web"], confirmed: true },
      "core-user": { questionId: "core-user", values: ["consumer"], confirmed: true }
    }),
    questionFor(idea, {
      "target-platform": { questionId: "target-platform", values: ["web"], confirmed: true },
      "core-user": { questionId: "core-user", values: ["consumer"], confirmed: true },
      "core-goal": { questionId: "core-goal", values: ["query"], confirmed: true }
    }),
    questionFor(idea, {
      "target-platform": { questionId: "target-platform", values: ["web"], confirmed: true },
      "core-user": { questionId: "core-user", values: ["consumer"], confirmed: true },
      "core-goal": { questionId: "core-goal", values: ["query"], confirmed: true },
      "core-flow": { questionId: "core-flow", values: ["browse-result"], confirmed: true }
    }),
    questionFor(idea, {
      "target-platform": { questionId: "target-platform", values: ["web"], confirmed: true },
      "core-user": { questionId: "core-user", values: ["consumer"], confirmed: true },
      "core-goal": { questionId: "core-goal", values: ["query"], confirmed: true },
      "core-flow": { questionId: "core-flow", values: ["browse-result"], confirmed: true },
      "core-modules": { questionId: "core-modules", values: ["home"], confirmed: true }
    })
  ];
  return questions.find((question) => question?.id === questionId) ?? null;
}
function selectedLabels(question, values) {
  return values.map((id) => question.options.find((option) => option.id === id)?.label ?? id);
}
function selectedAnswerLabels(question, answer) {
  if (answer === void 0) return [];
  const labels = selectedLabels(question, answer.values.filter((id) => id !== "other"));
  if (answer.values.includes("other") && answer.otherText?.trim()) labels.push(answer.otherText.trim());
  return labels;
}
function deriveComponents(idea, modules) {
  const labels = /* @__PURE__ */ new Map([
    ["calendar", "\u65E5\u671F\u9009\u62E9\u5668"],
    ["weather", "\u5929\u6C14\u4FE1\u606F\u5361"],
    ["outfit", "\u7A7F\u642D\u63A8\u8350\u5361"],
    ["wardrobe", "\u8863\u6A71\u5217\u8868"],
    ["favorite", "\u6536\u85CF / \u5206\u4EAB\u64CD\u4F5C"],
    ["catalog", "\u5546\u54C1\u5217\u8868"],
    ["search-filter", "\u641C\u7D22\u4E0E\u7B5B\u9009\u5668"],
    ["detail", "\u8BE6\u60C5\u5361\u7247"],
    ["cart", "\u8D2D\u7269\u8F66\u6458\u8981"],
    ["order", "\u8BA2\u5355\u4E0E\u652F\u4ED8\u64CD\u4F5C"],
    ["home", "\u9996\u9875\u603B\u89C8\u5361\u7247"],
    ["create-edit", "\u521B\u5EFA / \u7F16\u8F91\u8868\u5355"],
    ["profile", "\u7528\u6237\u8D44\u6599\u5361"],
    ["settings", "\u8BBE\u7F6E\u5217\u8868"],
    ["radar-home", "\u96F7\u8FBE\u626B\u63CF\u4E0E\u9644\u8FD1\u7528\u6237\u5206\u5E03"],
    ["bump-connect", "\u78B0\u4E00\u78B0\u9A8C\u8BC1\u4E0E\u52A0\u597D\u53CB\u64CD\u4F5C"],
    ["friends-chat", "\u597D\u53CB\u5217\u8868\u4E0E\u804A\u5929"],
    ["profile-history", "\u4E2A\u4EBA\u8D44\u6599\u3001\u96F7\u8FBE\u8DB3\u8FF9\u4E0E\u78B0\u4E00\u78B0\u5386\u53F2"],
    ["safety-privacy", "\u9690\u79C1\u4E0E\u5B89\u5168\u63A7\u5236"]
  ]);
  return modules.map((id) => ({
    type: id,
    label: labels.get(id) ?? `${id} \u6A21\u5757`
  })).concat(idea.trim() === "" ? [] : [{ type: "navigation", label: "\u9875\u9762\u5BFC\u822A\u4E0E\u4E3B\u6D41\u7A0B\u7BAD\u5934" }]);
}
var SEMANTIC_COMPONENT_CATALOG = [
  { kind: "page-header", role: "page-heading", purpose: "\u8BF4\u660E\u9875\u9762\u8EAB\u4EFD\u4E0E\u5F53\u524D\u4E0A\u4E0B\u6587", requiredParts: ["\u53EF\u8BFB\u9875\u9762\u6807\u9898", "\u5FC5\u8981\u7684\u8FD4\u56DE\u3001\u65E5\u671F\u6216\u72B6\u6001\u4E0A\u4E0B\u6587"] },
  { kind: "task-card", role: "content-card", purpose: "\u627F\u8F7D\u4E00\u6761\u53EF\u64CD\u4F5C\u7684\u771F\u5B9E\u8BB0\u5F55", requiredParts: ["\u5BF9\u8C61\u6807\u9898", "\u72B6\u6001\u6216\u65F6\u95F4", "\u5FC5\u8981\u7684\u6B21\u7EA7\u4FE1\u606F"] },
  { kind: "form-field", role: "input", purpose: "\u4F4E\u6210\u672C\u5F55\u5165\u6216\u4FEE\u6539\u4FE1\u606F", requiredParts: ["\u5B57\u6BB5\u6807\u7B7E", "\u771F\u5B9E\u503C\u6216\u53EF\u7406\u89E3\u63D0\u793A", "\u8F93\u5165\u8FB9\u754C"] },
  { kind: "chip-group", role: "chip", purpose: "\u8868\u8FBE\u5C11\u91CF\u4E92\u65A5\u6216\u7B5B\u9009\u9009\u62E9", requiredParts: ["\u5B8C\u6574\u9009\u9879\u6587\u5B57", "\u6E05\u695A\u7684\u5F53\u524D\u9009\u4E2D\u9879"] },
  { kind: "stat-card", role: "stat-card", purpose: "\u7A81\u51FA\u4E00\u4E2A\u53EF\u6BD4\u8F83\u7684\u5173\u952E\u6307\u6807", requiredParts: ["\u6307\u6807\u540D", "\u6570\u503C\u4E0E\u5355\u4F4D", "\u5FC5\u8981\u7684\u72B6\u6001\u8BF4\u660E"] },
  { kind: "quadrant-grid", role: "category-card", purpose: "\u5E76\u5217\u5448\u73B0\u56DB\u7C7B\u4F18\u5148\u7EA7\u6216\u72B6\u6001", requiredParts: ["\u56DB\u4E2A\u8BED\u4E49\u6807\u9898", "\u514B\u5236\u7684\u8BED\u4E49\u8272", "\u6BCF\u7C7B\u771F\u5B9E\u5185\u5BB9"] },
  { kind: "radar-map", role: "radar-map", purpose: "\u8868\u8FBE\u9644\u8FD1\u5BF9\u8C61\u76F8\u5BF9\u4F4D\u7F6E\u4E0E\u626B\u63CF\u72B6\u6001", requiredParts: ["\u626B\u63CF\u4E2D\u5FC3", "\u81F3\u5C11 3 \u4E2A\u771F\u5B9E\u5BF9\u8C61\u70B9", "\u8DDD\u79BB\u6216\u5728\u7EBF\u72B6\u6001"] },
  { kind: "conversation-list", role: "message-list", purpose: "\u627F\u8F7D\u8054\u7CFB\u4EBA\u4E0E\u53CC\u65B9\u5BF9\u8BDD", requiredParts: ["\u8054\u7CFB\u4EBA\u6635\u79F0\u4E0E\u65F6\u95F4", "\u6700\u8FD1\u6D88\u606F", "\u53EF\u8BFB\u7684\u53CC\u65B9\u6D88\u606F\u6C14\u6CE1"] },
  { kind: "calendar-grid", role: "calendar-grid", purpose: "\u8868\u8FBE\u5B8C\u6574\u65E5\u671F\u7ED3\u6784\u4E0E\u5F53\u524D\u9009\u62E9", requiredParts: ["\u661F\u671F\u6807\u9898", "\u5B8C\u6574\u65E5\u671F\u7F51\u683C", "\u660E\u786E\u7684\u9009\u4E2D\u65E5\u671F"] },
  { kind: "outfit-card", role: "recommendation-card", purpose: "\u8868\u8FBE\u4E00\u5957\u53EF\u7406\u89E3\u7684\u7A7F\u642D\u65B9\u6848", requiredParts: ["\u642D\u914D\u540D\u79F0", "\u81F3\u5C11 3 \u4EF6\u5177\u4F53\u5355\u54C1", "\u63A8\u8350\u7406\u7531\u548C\u9002\u7528\u6761\u4EF6"] },
  { kind: "bottom-navigation", role: "bottom-navigation", purpose: "\u7A33\u5B9A\u8868\u8FBE\u4E00\u7EA7\u9875\u9762\u5207\u6362", requiredParts: ["\u5BFC\u822A shell", "\u72EC\u7ACB\u4E14\u5B8C\u6574\u7684\u680F\u76EE\u6807\u7B7E", "\u660E\u786E\u7684\u5F53\u524D\u9879"] },
  { kind: "primary-action", role: "primary-action", purpose: "\u63A8\u8FDB\u5F53\u524D\u9875\u9762\u7684\u552F\u4E00\u6838\u5FC3\u4EFB\u52A1", requiredParts: ["\u660E\u786E\u52A8\u8BCD\u6587\u6848", "\u81F3\u5C11 44\xD744px \u70B9\u51FB\u533A\u57DF", "\u4E0E\u6B21\u8981\u64CD\u4F5C\u6709\u5C42\u7EA7\u5DEE"] }
];
var SOCIAL_PAGE_MOCK_DATA = {
  "radar-home": {
    minimumRecords: 3,
    requiredContent: ["\u5F53\u524D\u626B\u63CF\u72B6\u6001\u4E0E\u9644\u8FD1\u4EBA\u6570", "\u81F3\u5C11 3 \u4E2A\u9644\u8FD1\u7528\u6237\u7684\u6635\u79F0\u548C\u8DDD\u79BB", "\u4E3B\u64CD\u4F5C\u4E0E\u91CD\u65B0\u626B\u63CF\u64CD\u4F5C"],
    examples: ["\u6797\u5C0F\u6EE1 \xB7 300m", "\u5468\u53EF\u4E50 \xB7 500m", "\u9648\u4E00\u5DDD \xB7 800m"]
  },
  "nearby-profile": {
    minimumRecords: 3,
    requiredContent: ["\u7528\u6237\u6635\u79F0\u3001\u8DDD\u79BB\u548C\u5728\u7EBF\u72B6\u6001", "\u81F3\u5C11 3 \u9879\u4E2A\u4EBA\u8D44\u6599\u6216\u5174\u8DA3\u6807\u7B7E", "\u89C1\u9762\u6216\u8FD4\u56DE\u96F7\u8FBE\u64CD\u4F5C"],
    examples: ["\u6797\u5C0F\u6EE1 \xB7 \u8DDD\u4F60 300m", "\u6444\u5F71", "\u5468\u672B\u5F92\u6B65"]
  },
  "bump-confirm": {
    minimumRecords: 3,
    requiredContent: ["\u78B0\u4E00\u78B0\u5BF9\u8C61\u6635\u79F0", "\u7B49\u5F85\u3001\u8BC6\u522B\u4E0E\u6210\u529F\u7ED3\u679C\u4E2D\u7684\u81F3\u5C11 3 \u6761\u72B6\u6001\u4FE1\u606F", "\u5F00\u59CB\u804A\u5929\u4E0E\u7A0D\u540E\u518D\u804A\u64CD\u4F5C"],
    examples: ["\u6B63\u5728\u8BC6\u522B\u9644\u8FD1\u8BBE\u5907\u2026", "\u5DF2\u786E\u8BA4\uFF1A\u6797\u5C0F\u6EE1", "14:20 \u6210\u4E3A\u597D\u53CB"]
  },
  "friends-chat": {
    minimumRecords: 3,
    requiredContent: ["\u81F3\u5C11 3 \u4F4D\u597D\u53CB\u7684\u6635\u79F0\u3001\u6700\u8FD1\u6D88\u606F\u548C\u65F6\u95F4", "\u804A\u5929\u6807\u9898\u4E0E\u5728\u7EBF\u72B6\u6001", "\u81F3\u5C11 3 \u6761\u53EF\u8BFB\u7684\u53CC\u65B9\u5BF9\u8BDD\u548C\u6D88\u606F\u8F93\u5165\u64CD\u4F5C"],
    examples: ["\u6797\u5C0F\u6EE1 \xB7 \u5468\u672B\u4E00\u8D77\u53BB\u5F92\u6B65\u5417\uFF1F \xB7 18:42", "\u5468\u53EF\u4E50 \xB7 \u78B0\u4E00\u78B0\u6210\u529F\u5566 \xB7 14:20", "\u9648\u4E00\u5DDD \xB7 \u4E0B\u6B21\u4E00\u8D77\u559D\u5496\u5561 \xB7 \u6628\u5929"]
  },
  "profile-history": {
    minimumRecords: 3,
    requiredContent: ["\u7528\u6237\u6635\u79F0\u4E0E\u96F7\u8FBE ID", "\u597D\u53CB\u6570\u3001\u8DB3\u8FF9\u6570\u3001\u78B0\u4E00\u78B0\u6B21\u6570", "\u81F3\u5C11 3 \u6761\u8DB3\u8FF9\u6216\u78B0\u4E00\u78B0\u5386\u53F2\u8BB0\u5F55"],
    examples: ["\u597D\u53CB 12", "\u96F7\u8FBE\u8DB3\u8FF9 38 \u5904", "\u4ECA\u5929 14:20 \xB7 \u5496\u5561\u5E97 \xB7 \u6797\u5C0F\u6EE1"]
  }
};
var CALENDAR_PAGE_MOCK_DATA = {
  query: {
    minimumRecords: 3,
    requiredContent: ["\u5DF2\u9009\u57CE\u5E02\u548C\u65E5\u671F", "\u5B8C\u6574\u53EF\u8BFB\u7684\u5F53\u6708\u65E5\u671F\u7F51\u683C", "\u8282\u6C14\u3001\u8282\u5047\u65E5\u6216\u5B9C\u5FCC\u6458\u8981"],
    examples: ["\u676D\u5DDE", "2026 \u5E74 6 \u6708 21 \u65E5", "\u590F\u81F3 \xB7 \u5B9C\u51FA\u884C"]
  },
  weather: {
    minimumRecords: 3,
    requiredContent: ["\u65E5\u671F\u4E0E\u57CE\u5E02", "\u6E29\u5EA6\u548C\u5929\u6C14\u72B6\u6001", "\u98CE\u529B\u3001\u6E7F\u5EA6\u6216\u964D\u6C34\u7B49\u81F3\u5C11 3 \u9879\u5929\u6C14\u6307\u6807"],
    examples: ["\u676D\u5DDE \xB7 6 \u6708 21 \u65E5", "26\u201332\xB0C \xB7 \u591A\u4E91", "\u4E1C\u5357\u98CE 3 \u7EA7 \xB7 \u6E7F\u5EA6 68%"]
  },
  recommendation: {
    minimumRecords: 3,
    requiredContent: ["\u63A8\u8350\u7406\u7531", "\u81F3\u5C11 3 \u4EF6\u5177\u4F53\u670D\u9970\u6216\u914D\u4EF6", "\u6536\u85CF\u3001\u6362\u4E00\u5957\u6216\u67E5\u770B\u8BE6\u60C5\u64CD\u4F5C"],
    examples: ["\u4E9A\u9EBB\u77ED\u8896", "\u6D45\u8272\u4F11\u95F2\u88E4", "\u9632\u6652\u5E3D"]
  },
  "outfit-detail": {
    minimumRecords: 3,
    requiredContent: ["\u642D\u914D\u540D\u79F0\u4E0E\u9002\u7528\u573A\u666F", "\u81F3\u5C11 3 \u4EF6\u5355\u54C1\u53CA\u7A7F\u642D\u8BF4\u660E", "\u5929\u6C14\u9002\u914D\u6216\u6CE8\u610F\u4E8B\u9879"],
    examples: ["\u901A\u52E4\u6E05\u723D\u642D\u914D", "\u4E9A\u9EBB\u77ED\u8896 \xB7 \u900F\u6C14", "\u8F7B\u8584\u5916\u5957 \xB7 \u5E94\u5BF9\u7A7A\u8C03\u623F"]
  },
  wardrobe: {
    minimumRecords: 3,
    requiredContent: ["\u5206\u7C7B\u4E0E\u7B5B\u9009\u72B6\u6001", "\u81F3\u5C11 3 \u4EF6\u8863\u7269\u7684\u540D\u79F0\u3001\u7C7B\u522B\u548C\u72B6\u6001", "\u65B0\u589E\u8863\u7269\u6216\u9009\u62E9\u642D\u914D\u64CD\u4F5C"],
    examples: ["\u767D\u8272\u4E9A\u9EBB\u886C\u886B \xB7 \u4E0A\u88C5 \xB7 \u53EF\u7A7F", "\u5361\u5176\u4F11\u95F2\u88E4 \xB7 \u4E0B\u88C5 \xB7 \u53EF\u7A7F", "\u8F7B\u8584\u98CE\u8863 \xB7 \u5916\u5957 \xB7 \u5F85\u6E05\u6D17"]
  }
};
var GENERIC_PAGE_MOCK_DATA = {
  home: {
    minimumRecords: 3,
    requiredContent: ["\u5F53\u524D\u72B6\u6001\u6216\u6458\u8981", "\u81F3\u5C11 3 \u6761\u5177\u6709\u771F\u5B9E\u8BED\u4E49\u7684\u5185\u5BB9\u8BB0\u5F55", "\u6E05\u6670\u7684\u9996\u8981\u64CD\u4F5C"],
    examples: ["\u4ECA\u65E5\u65B0\u589E 6 \u6761", "\u5F85\u5904\u7406 3 \u6761", "\u6700\u8FD1\u66F4\u65B0\u4E8E 10:30"]
  },
  "core-action": {
    minimumRecords: 3,
    requiredContent: ["\u5F53\u524D\u64CD\u4F5C\u5BF9\u8C61", "\u81F3\u5C11 3 \u4E2A\u5DF2\u586B\u5199\u7684\u5173\u952E\u5B57\u6BB5\u6216\u6B65\u9AA4\u72B6\u6001", "\u63D0\u4EA4\u4E0E\u53D6\u6D88\u64CD\u4F5C"],
    examples: ["\u5F53\u524D\u5BF9\u8C61\uFF1A\u793A\u4F8B\u8BB0\u5F55", "\u6B65\u9AA4 2 / 3", "\u5DF2\u586B\u5199 4 \u9879"]
  },
  result: {
    minimumRecords: 3,
    requiredContent: ["\u7ED3\u679C\u6807\u9898\u4E0E\u6458\u8981", "\u81F3\u5C11 3 \u6761\u7ED3\u679C\u8BB0\u5F55\u6216\u6307\u6807", "\u7EE7\u7EED\u64CD\u4F5C\u6216\u8FD4\u56DE\u5165\u53E3"],
    examples: ["\u5171\u627E\u5230 12 \u6761\u7ED3\u679C", "\u63A8\u8350\u7ED3\u679C A \xB7 \u5339\u914D\u5EA6 92%", "\u63A8\u8350\u7ED3\u679C B \xB7 \u5339\u914D\u5EA6 87%"]
  },
  detail: {
    minimumRecords: 3,
    requiredContent: ["\u5BF9\u8C61\u540D\u79F0\u4E0E\u5F53\u524D\u72B6\u6001", "\u81F3\u5C11 3 \u9879\u5173\u952E\u5C5E\u6027\u6216\u8BB0\u5F55", "\u4E3B\u8981\u64CD\u4F5C\u4E0E\u8FD4\u56DE\u5165\u53E3"],
    examples: ["\u793A\u4F8B\u5BF9\u8C61 \xB7 \u8FDB\u884C\u4E2D", "\u521B\u5EFA\u4E8E 6 \u6708 21 \u65E5", "\u8D1F\u8D23\u4EBA\uFF1A\u6797\u5C0F\u6EE1"]
  },
  profile: {
    minimumRecords: 3,
    requiredContent: ["\u7528\u6237\u540D\u79F0\u4E0E\u8EAB\u4EFD\u4FE1\u606F", "\u81F3\u5C11 3 \u9879\u7EDF\u8BA1\u6216\u4E2A\u4EBA\u8D44\u6599", "\u8BBE\u7F6E\u6216\u9000\u51FA\u64CD\u4F5C"],
    examples: ["\u6797\u5C0F\u6EE1", "\u5DF2\u5B8C\u6210 28 \u9879", "\u8FDE\u7EED\u4F7F\u7528 7 \u5929"]
  }
};
function derivePageMockData(idea, pageIds) {
  const pageLabels = new Map(pageOptions(idea).map((option) => [option.id, option.label]));
  const domainSpecs = isSocialIdea(idea) ? SOCIAL_PAGE_MOCK_DATA : includesIdea(idea, /万年历|穿搭|天气|衣橱|服饰/iu) ? CALENDAR_PAGE_MOCK_DATA : GENERIC_PAGE_MOCK_DATA;
  return pageIds.map((pageId) => {
    const spec = domainSpecs[pageId] ?? GENERIC_PAGE_MOCK_DATA[pageId] ?? {
      minimumRecords: 3,
      requiredContent: ["\u9875\u9762\u76EE\u7684\u8BF4\u660E", "\u81F3\u5C11 3 \u6761\u5177\u6709\u771F\u5B9E\u8BED\u4E49\u7684\u793A\u4F8B\u8BB0\u5F55", "\u6E05\u6670\u7684\u4E3B\u8981\u64CD\u4F5C\u548C\u72B6\u6001\u53CD\u9988"],
      examples: ["\u793A\u4F8B\u8BB0\u5F55 1 \xB7 \u5DF2\u5B8C\u6210", "\u793A\u4F8B\u8BB0\u5F55 2 \xB7 \u8FDB\u884C\u4E2D", "\u793A\u4F8B\u8BB0\u5F55 3 \xB7 \u5F85\u5904\u7406"]
    };
    return {
      pageId,
      page: pageLabels.get(pageId) ?? pageId,
      ...spec
    };
  });
}
function pageIntent(pageId, pageName, requiredContent) {
  const intents = {
    "radar-home": { coreTask: "\u7ACB\u5373\u770B\u89C1\u9644\u8FD1\u53EF\u53D1\u73B0\u7684\u4EBA\uFF0C\u5E76\u51B3\u5B9A\u7EE7\u7EED\u626B\u63CF\u6216\u53D1\u8D77\u78B0\u4E00\u78B0", primaryAction: "\u5F00\u59CB\u626B\u63CF / \u91CD\u65B0\u626B\u63CF" },
    "nearby-profile": { coreTask: "\u5FEB\u901F\u5224\u65AD\u662F\u5426\u613F\u610F\u8FDB\u4E00\u6B65\u8BA4\u8BC6\u5F53\u524D\u7528\u6237", primaryAction: "\u53D1\u8D77\u89C1\u9762 / \u78B0\u4E00\u78B0" },
    "bump-confirm": { coreTask: "\u786E\u8BA4\u7EBF\u4E0B\u78B0\u4E00\u78B0\u5BF9\u8C61\u5E76\u5EFA\u7ACB\u597D\u53CB\u5173\u7CFB", primaryAction: "\u786E\u8BA4\u5E76\u5F00\u59CB\u804A\u5929" },
    "friends-chat": { coreTask: "\u627E\u5230\u6700\u8FD1\u8054\u7CFB\u4EBA\u5E76\u7EE7\u7EED\u4E00\u6BB5\u771F\u5B9E\u5BF9\u8BDD", primaryAction: "\u53D1\u9001\u6D88\u606F" },
    "profile-history": { coreTask: "\u67E5\u770B\u81EA\u5DF1\u7684\u793E\u4EA4\u8EAB\u4EFD\u3001\u5173\u7CFB\u6570\u636E\u548C\u6700\u8FD1\u8DB3\u8FF9", primaryAction: "\u7F16\u8F91\u4E2A\u4EBA\u8D44\u6599" },
    query: { coreTask: "\u9009\u62E9\u65E5\u671F\u548C\u57CE\u5E02\u5E76\u83B7\u5F97\u53EF\u7406\u89E3\u7684\u65E5\u5386\u7ED3\u679C", primaryAction: "\u67E5\u8BE2\u5F53\u5929\u4FE1\u606F" },
    weather: { coreTask: "\u770B\u61C2\u76EE\u6807\u65E5\u671F\u7684\u5929\u6C14\u6761\u4EF6\u4E0E\u51FA\u884C\u5F71\u54CD", primaryAction: "\u67E5\u770B\u7A7F\u642D\u5EFA\u8BAE" },
    recommendation: { coreTask: "\u5728\u51E0\u79D2\u5185\u7406\u89E3\u5F53\u5929\u63A8\u8350\u7A7F\u642D\u5E76\u9009\u5B9A\u4E00\u5957", primaryAction: "\u91C7\u7528\u8FD9\u5957\u642D\u914D" },
    "outfit-detail": { coreTask: "\u770B\u61C2\u4E00\u5957\u642D\u914D\u7684\u5355\u54C1\u7EC4\u6210\u3001\u7406\u7531\u548C\u9002\u7528\u573A\u666F", primaryAction: "\u6536\u85CF\u642D\u914D" },
    wardrobe: { coreTask: "\u6D4F\u89C8\u81EA\u5DF1\u7684\u8863\u7269\u72B6\u6001\u5E76\u9009\u62E9\u53EF\u7528\u5355\u54C1", primaryAction: "\u65B0\u589E\u8863\u7269" },
    home: { coreTask: "\u4ECE\u603B\u89C8\u4E2D\u8BC6\u522B\u5F53\u524D\u6700\u91CD\u8981\u7684\u4FE1\u606F\u548C\u4E0B\u4E00\u6B65", primaryAction: "\u8FDB\u5165\u5F53\u524D\u6700\u91CD\u8981\u7684\u4EFB\u52A1" },
    "core-action": { coreTask: "\u4EE5\u6700\u4F4E\u64CD\u4F5C\u6210\u672C\u5B8C\u6210\u6838\u5FC3\u5F55\u5165\u6216\u7F16\u8F91", primaryAction: "\u4FDD\u5B58\u5E76\u7EE7\u7EED" },
    result: { coreTask: "\u6BD4\u8F83\u5173\u952E\u7ED3\u679C\u5E76\u9009\u62E9\u4E0B\u4E00\u6B65", primaryAction: "\u91C7\u7528\u63A8\u8350\u7ED3\u679C" },
    detail: { coreTask: "\u7406\u89E3\u5F53\u524D\u5BF9\u8C61\u7684\u72B6\u6001\u3001\u5173\u952E\u4FE1\u606F\u548C\u53EF\u6267\u884C\u64CD\u4F5C", primaryAction: "\u5B8C\u6210\u5F53\u524D\u4E3B\u8981\u64CD\u4F5C" },
    profile: { coreTask: "\u67E5\u770B\u4E2A\u4EBA\u72B6\u6001\u5E76\u8FDB\u5165\u6700\u5E38\u7528\u7684\u8D26\u6237\u64CD\u4F5C", primaryAction: "\u7F16\u8F91\u4E2A\u4EBA\u8D44\u6599" }
  };
  return intents[pageId] ?? {
    coreTask: `\u5728\u300C${pageName}\u300D\u9996\u5C4F\u5B8C\u6210\uFF1A${requiredContent[0] ?? "\u7406\u89E3\u5F53\u524D\u5BF9\u8C61\u548C\u72B6\u6001"}`,
    primaryAction: `\u5B8C\u6210${pageName}\u7684\u4E3B\u8981\u64CD\u4F5C`
  };
}
var BOTTOM_NAVIGATION_PAGE_IDS = /* @__PURE__ */ new Set([
  "home",
  "result",
  "profile",
  "radar-home",
  "friends-chat",
  "profile-history",
  "query",
  "weather",
  "recommendation",
  "wardrobe"
]);
function componentKindsFor(pageId, requiredContent) {
  const kinds = ["page-header"];
  const content = requiredContent.join(" ");
  if (pageId === "radar-home") kinds.push("radar-map");
  if (pageId === "friends-chat") kinds.push("conversation-list");
  if (pageId === "query" || pageId === "weather") kinds.push("calendar-grid");
  if (pageId === "recommendation" || pageId === "outfit-detail") kinds.push("outfit-card");
  if (/输入|填写|选择|筛选|搜索|字段|步骤/iu.test(content) || /action|confirm|edit|query/iu.test(pageId)) kinds.push("form-field", "chip-group");
  if (/指标|统计|数量|状态|摘要|天气|完成率/iu.test(content) || /home|result|profile|weather|recommendation/iu.test(pageId)) kinds.push("stat-card");
  if (pageId !== "friends-chat" && /列表|记录|单品|内容|用户|好友|至少 3/iu.test(content)) kinds.push("task-card");
  if (BOTTOM_NAVIGATION_PAGE_IDS.has(pageId)) kinds.push("bottom-navigation");
  kinds.push("primary-action");
  return kinds;
}
function derivePageBlueprints(idea, pageIds) {
  const mockByPage = new Map(derivePageMockData(idea, pageIds).map((item) => [item.pageId, item]));
  return pageIds.map((pageId) => {
    const mock = mockByPage.get(pageId);
    const intent = pageIntent(pageId, mock.page, mock.requiredContent);
    const kinds = new Set(componentKindsFor(pageId, mock.requiredContent));
    return {
      pageId,
      page: mock.page,
      ...intent,
      aboveFold: [
        `\u9875\u9762\u6807\u9898\u4E0E\u5F53\u524D\u4E0A\u4E0B\u6587\uFF1A${mock.page}`,
        ...mock.requiredContent.slice(0, 2),
        `\u552F\u4E00\u4E3B\u8981\u64CD\u4F5C\uFF1A${intent.primaryAction}`
      ],
      semanticComponents: SEMANTIC_COMPONENT_CATALOG.filter((component) => kinds.has(component.kind))
    };
  });
}
function buildBrief(idea, answers, deferredStyleNote) {
  const read = (id) => answers[id];
  const targetQuestion = questionFor(idea, {});
  const userQuestion = questionFor(idea, { "target-platform": read("target-platform") });
  const goalQuestion = questionFor(idea, {
    "target-platform": read("target-platform"),
    "core-user": read("core-user")
  });
  const flowQuestion = questionFor(idea, {
    "target-platform": read("target-platform"),
    "core-user": read("core-user"),
    "core-goal": read("core-goal")
  });
  const moduleQuestion = questionFor(idea, {
    "target-platform": read("target-platform"),
    "core-user": read("core-user"),
    "core-goal": read("core-goal"),
    "core-flow": read("core-flow")
  });
  const pageQuestion = questionFor(idea, {
    "target-platform": read("target-platform"),
    "core-user": read("core-user"),
    "core-goal": read("core-goal"),
    "core-flow": read("core-flow"),
    "core-modules": read("core-modules")
  });
  const modules = read("core-modules")?.values ?? [];
  const pages = read("core-pages")?.values ?? [];
  const pendingDecisions = [];
  const questionPairs = [
    [targetQuestion, read("target-platform")],
    [userQuestion, read("core-user")],
    [goalQuestion, read("core-goal")],
    [flowQuestion, read("core-flow")],
    [moduleQuestion, read("core-modules")],
    [pageQuestion, read("core-pages")]
  ];
  for (const [question, answer] of questionPairs) {
    if (answer?.values.includes("unknown")) pendingDecisions.push(`${question.text}\uFF08\u7528\u6237\u6682\u672A\u51B3\u5B9A\uFF09`);
    if (answer?.confirmed === false && answer.otherText !== void 0) pendingDecisions.push(`${question.text}\uFF08\u4FDD\u7559\u7528\u6237\u539F\u8BDD\uFF0C\u6682\u4E0D\u63A8\u65AD\uFF09`);
  }
  return {
    originalIdea: idea,
    targetPlatform: selectedAnswerLabels(targetQuestion, read("target-platform"))[0] ?? null,
    users: selectedAnswerLabels(userQuestion, read("core-user")),
    goal: selectedAnswerLabels(goalQuestion, read("core-goal"))[0] ?? null,
    coreFlow: {
      labels: selectedAnswerLabels(flowQuestion, read("core-flow")),
      userText: read("core-flow")?.otherText ?? read("core-flow")?.normalizedText ?? null
    },
    modules: selectedAnswerLabels(moduleQuestion, read("core-modules")),
    moduleIds: modules,
    pages: selectedAnswerLabels(pageQuestion, read("core-pages")),
    pageIds: pages,
    components: deriveComponents(idea, modules),
    mockDataPolicy: {
      rule: "\u5217\u8868\u3001\u804A\u5929\u3001\u56FE\u8868\u3001\u8BE6\u60C5\u548C\u72B6\u6001\u7EC4\u4EF6\u5FC5\u987B\u5C55\u793A\u771F\u5B9E\u793A\u4F8B\u5185\u5BB9\uFF0C\u4E0D\u80FD\u4F7F\u7528\u7A7A\u767D\u65B9\u6846\u3001Lorem ipsum\u3001\u7528\u6237A\u6216\u65E0\u542B\u4E49\u5360\u4F4D\u7B26\u4EE3\u66FF",
      minimumRecordsPerRepeatedComponent: 3,
      visibility: "mock \u6570\u636E\u5FC5\u987B\u4F7F\u7528\u9996\u6B21\u6E32\u67D3\u5373\u53EF\u89C1\u7684\u72EC\u7ACB text \u5143\u7D20\uFF1B\u5217\u8868\u884C\u9700\u540C\u65F6\u4F53\u73B0\u5BF9\u8C61\u3001\u72B6\u6001\u548C\u5173\u952E\u4E0A\u4E0B\u6587",
      updateContract: "\u5B8C\u6574\u9875\u9762\u4F7F\u7528 rectangle \u5916\u6846\u5E76\u8BBE\u7F6E customData.role=prototype-page\u3001customData.pageName \u548C customData.mockDataMin\uFF1B\u9875\u9762\u540D\u4F7F\u7528\u5916\u6846\u4E0A\u65B9\u72EC\u7ACB text\uFF0C\u8BBE\u7F6E customData.role=prototype-page-label \u548C customData.pageId\uFF1B\u9875\u9762\u5B50\u5143\u7D20\u4F7F\u7528\u753B\u5E03\u7EDD\u5BF9\u5750\u6807\u5E76\u4FDD\u6301 frameId=null\uFF1B\u6BCF\u6761\u793A\u4F8B\u5185\u5BB9\u7684 text \u8BBE\u7F6E customData.role=mock-data"
    },
    pageMockData: derivePageMockData(idea, pages),
    pageBlueprints: derivePageBlueprints(idea, pages),
    semanticComponentCatalog: SEMANTIC_COMPONENT_CATALOG,
    prototypeQualityPolicy: {
      firstScreen: "\u7528\u6237\u5E94\u5728 5 \u79D2\u5185\u770B\u61C2\u9875\u9762\u6838\u5FC3\u4EFB\u52A1\u3001\u5F53\u524D\u72B6\u6001\u3001\u5173\u952E\u5185\u5BB9\u548C\u4E0B\u4E00\u6B65\uFF1B\u4E0D\u80FD\u4F9D\u8D56\u7A7A\u767D\u65B9\u6846\u6216 Agent \u53E3\u5934\u89E3\u91CA",
      hierarchy: "\u6BCF\u9875\u53EA\u6709\u4E00\u4E2A primary-action\uFF1B\u6807\u9898\u3001\u6B63\u6587\u548C\u8F85\u52A9\u4FE1\u606F\u81F3\u5C11\u5F62\u6210\u4E09\u7EA7\u53EF\u8FA8\u5C42\u7EA7\uFF1B\u91CD\u590D\u63A7\u4EF6\u9075\u5FAA\u4E00\u81F4\u7684\u8FB9\u8DDD\u3001\u9AD8\u5EA6\u548C\u95F4\u8DDD\u8282\u594F",
      phasedDrawing: "\u9996\u6279 3 \u4E2A\u53CA\u4EE5\u4E0A\u9875\u9762\u65F6\uFF0C\u5148\u7ED8\u5236\u4E00\u4E2A\u4EE3\u8868\u9875\u5E76\u68C0\u67E5\u771F\u5B9E\u753B\u677F\uFF0C\u518D\u94FA\u5F00\u5176\u4F59\u9875\u9762\uFF0C\u6700\u540E\u9010\u9875\u505A\u4E00\u81F4\u6027\u590D\u6838",
      completionRule: "writeVerified=true \u53EA\u4EE3\u8868\u5199\u5165\u548C\u56DE\u8BFB\u4E00\u81F4\uFF1B\u53EA\u6709\u63D0\u4EA4\u89C6\u89C9\u590D\u6838\u8BC1\u636E\u5E76\u83B7\u5F97 completionReady=true\uFF0CAgent \u624D\u80FD\u5411\u7528\u6237\u5BA3\u5E03\u539F\u578B\u5B8C\u6210"
    },
    interactions: ["\u9875\u9762\u4E4B\u95F4\u7528 Arrow \u8868\u8FBE\u6838\u5FC3\u6210\u529F\u8DEF\u5F84", "\u9996\u8F6E\u53EA\u9A8C\u8BC1\u9ED8\u8BA4\u6210\u529F\u8DEF\u5F84"],
    assumptions: [
      "\u9996\u8F6E\u539F\u578B\u9650\u5236\u4E3A 3\u20135 \u4E2A\u6838\u5FC3\u9875\u9762",
      "\u9996\u8F6E\u53EA\u7ED8\u5236\u9ED8\u8BA4\u6210\u529F\u8DEF\u5F84\uFF0C\u4E0D\u5C55\u5F00\u52A0\u8F7D\u3001\u7A7A\u72B6\u6001\u548C\u9519\u8BEF\u72B6\u6001",
      "\u6BCF\u4E2A\u91CD\u590D\u5185\u5BB9\u7EC4\u4EF6\u81F3\u5C11\u586B\u5145 3 \u6761\u53EF\u8BFB mock \u6570\u636E\uFF1B\u4F4E\u4FDD\u771F\u964D\u4F4E\u89C6\u89C9\u7CBE\u5EA6\uFF0C\u4F46\u4E0D\u7701\u7565\u7406\u89E3\u4EA7\u54C1\u6240\u9700\u7684\u4FE1\u606F",
      "\u539F\u578B\u4F7F\u7528\u8BED\u4E49\u5316\u4F4E\u4FDD\u771F\uFF0C\u4E0D\u5904\u7406\u54C1\u724C\u8272\u3001\u5B57\u4F53\u548C\u89C6\u89C9\u98CE\u683C\uFF1B\u53EF\u7528\u514B\u5236\u7684\u8BED\u4E49\u8272\u533A\u5206\u7C7B\u522B\u3001\u72B6\u6001\u548C\u4E3B\u8981\u64CD\u4F5C",
      "\u89C6\u89C9\u98CE\u683C\u548C\u524D\u7AEF\u6280\u672F\u5B9E\u73B0\u5EF6\u8FDF\u5230 draw2code_generate \u9636\u6BB5",
      ...pendingDecisions.map((item) => `${item}\uFF1B\u9996\u7248\u91C7\u7528\u6700\u5C0F\u5408\u7406\u9ED8\u8BA4\u503C\uFF0C\u5E76\u5728\u540E\u7EED\u8FED\u4EE3\u4E2D\u8865\u5145`)
    ],
    pendingDecisions,
    deferredStyleNote,
    pendingQuestions: [
      "\u52A0\u8F7D\u3001\u7A7A\u72B6\u6001\u548C\u9519\u8BEF\u72B6\u6001\u5C06\u5728\u540E\u7EED\u539F\u578B\u8FED\u4EE3\u4E2D\u8865\u5145",
      "\u767B\u5F55\u3001\u4E2A\u4EBA\u4E2D\u5FC3\u548C\u7BA1\u7406\u540E\u53F0\u4E0D\u5C5E\u4E8E\u9996\u8F6E\u6838\u5FC3\u95ED\u73AF\uFF0C\u9664\u975E\u7528\u6237\u53E6\u884C\u786E\u8BA4"
    ]
  };
}
function interpretOther(question, text3) {
  const trimmed = text3.trim();
  if (question.id === "target-platform" && /小程序/iu.test(trimmed)) {
    return "\u9996\u7248\u4F18\u5148\u505A\u5C0F\u7A0B\u5E8F\uFF0CWeb \u4F5C\u4E3A\u540E\u7EED\u6269\u5C55\u7AEF";
  }
  if (question.id === "core-flow") return `\u6838\u5FC3\u6D41\u7A0B\u6309\u7528\u6237\u63CF\u8FF0\uFF1A${trimmed}`;
  return `\u6309\u7528\u6237\u63CF\u8FF0\u5904\u7406\uFF1A${trimmed}`;
}

// src/create-discovery.ts
var CREATE_FLOW_VERSION = 2;
var MAX_DISCOVERY_QUESTIONS = 10;
var DISCOVERY_DIMENSION_IDS = [
  "trigger-context",
  "existing-alternative",
  "core-outcome",
  "unique-mechanism",
  "core-loop",
  "critical-risk",
  "scope-proof",
  "target-user",
  "target-platform",
  "product-architecture"
];
var DISCOVERY_DIMENSIONS = new Set(DISCOVERY_DIMENSION_IDS);
var GENERIC_QUESTION_RE = /^(?:这个工具主要服务谁|你的核心目标是什么|首版最重要的是帮助用户完成什么|用户最重要的一条使用流程是什么|第一版需要包含哪些核心模块|首轮原型要画哪些核心页面)[？?]?$/u;
var ARCHITECTURE_LIST_RE = /(?:需要哪些|选择哪些|包含哪些).*(?:模块|页面)|(?:核心模块|核心页面).*请选择/iu;
function platformFact(answers) {
  const platform = answers["target-platform"]?.values[0];
  if (platform === "app") return "\u4EA7\u54C1\u7AEF\uFF1AApp";
  if (platform === "web") return "\u4EA7\u54C1\u7AEF\uFF1AWeb";
  if (platform === "mini-program") return "\u4EA7\u54C1\u7AEF\uFF1A\u5C0F\u7A0B\u5E8F";
  return null;
}
function domainFacts(idea) {
  const facts = [];
  if (/陌生人|社交|交友|附近的人|雷达|碰一碰|好友|聊天/iu.test(idea)) facts.push("\u4EA7\u54C1\u65B9\u5411\uFF1A\u9644\u8FD1\u53D1\u73B0\u4E0E\u964C\u751F\u4EBA\u793E\u4EA4");
  if (/万年历|穿搭|天气|衣橱|服饰/iu.test(idea)) facts.push("\u4EA7\u54C1\u65B9\u5411\uFF1A\u65E5\u671F\u3001\u5929\u6C14\u4E0E\u7A7F\u642D\u5EFA\u8BAE");
  if (/待办|任务|清单|todo/iu.test(idea)) facts.push("\u4EA7\u54C1\u65B9\u5411\uFF1A\u4EFB\u52A1\u4E0E\u5F85\u529E\u7BA1\u7406");
  return facts;
}
function recommendedDimensions(idea) {
  if (/陌生人|社交|交友|附近的人|雷达|碰一碰|好友|聊天/iu.test(idea)) return ["unique-mechanism", "critical-risk", "core-loop"];
  if (/万年历|穿搭|天气|衣橱|服饰/iu.test(idea)) return ["unique-mechanism", "trigger-context", "critical-risk"];
  if (/待办|任务|清单|todo/iu.test(idea)) return ["trigger-context", "existing-alternative", "core-outcome"];
  return ["trigger-context", "core-outcome", "existing-alternative"];
}
function initialDiscovery(idea, answers) {
  const fact = platformFact(answers);
  const explicitFacts = [`\u7528\u6237\u539F\u8BDD\uFF1A${idea.trim()}`, ...fact === null ? [] : [fact], ...domainFacts(idea)];
  const openDimensions = DISCOVERY_DIMENSION_IDS.filter((dimension) => dimension !== "target-platform" || fact === null);
  return {
    explicitFacts,
    assumptions: [],
    resolvedDecisions: [],
    openDimensions,
    recommendedDimensions: recommendedDimensions(idea).filter((dimension) => openDimensions.includes(dimension)),
    questions: [],
    invalidatedQuestionIds: [],
    adjustmentQuestionIds: [],
    questionCount: 0,
    maxQuestions: MAX_DISCOVERY_QUESTIONS,
    remainingQuestions: MAX_DISCOVERY_QUESTIONS,
    nextAction: "propose_question",
    stopReason: null
  };
}
function refreshDiscovery(state) {
  const adjustmentQuestionIds = new Set(state.adjustmentQuestionIds ?? []);
  const questionCount = state.questions.filter((question) => !adjustmentQuestionIds.has(question.id)).length;
  const remainingQuestions = Math.max(0, state.maxQuestions - questionCount);
  return {
    ...state,
    questionCount,
    remainingQuestions,
    nextAction: remainingQuestions === 0 ? "synthesize" : "propose_question"
  };
}
function removeDependentQuestions(state, questionId) {
  const removed = /* @__PURE__ */ new Set();
  const alreadyInvalidated = new Set(state.invalidatedQuestionIds ?? []);
  let changed = true;
  while (changed) {
    changed = false;
    for (const question of state.questions) {
      if (question.id === questionId || removed.has(question.id) || alreadyInvalidated.has(question.id)) continue;
      if ((question.dependsOn ?? []).some((dependency) => dependency === questionId || removed.has(dependency))) {
        removed.add(question.id);
        changed = true;
      }
    }
  }
  const prefixes = [...removed].map((id) => `${id}\uFF1A`);
  const removedDimensions = state.questions.filter((question) => removed.has(question.id)).map((question) => question.dimension);
  return {
    discovery: refreshDiscovery({
      ...state,
      invalidatedQuestionIds: [.../* @__PURE__ */ new Set([...alreadyInvalidated, ...removed])],
      openDimensions: [.../* @__PURE__ */ new Set([...state.openDimensions, ...removedDimensions])],
      resolvedDecisions: state.resolvedDecisions.filter((item) => !prefixes.some((prefix) => item.startsWith(prefix))),
      assumptions: state.assumptions.filter((item) => !prefixes.some((prefix) => item.startsWith(prefix)))
    }),
    removedIds: [...removed]
  };
}
function nonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "";
}
function objectValue(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : null;
}
function normalizedQuestionText(value) {
  return value.toLowerCase().replace(/[\s，。！？、,.!?：:；;（）()]/gu, "");
}
var GROUNDING_STOP_WORDS = /* @__PURE__ */ new Set([
  "\u4E00\u4E2A",
  "\u4E00\u6B3E",
  "\u8FD9\u4E2A",
  "\u7528\u6237",
  "\u4EA7\u54C1",
  "\u5DE5\u5177",
  "\u5E94\u7528",
  "\u9996\u7248",
  "\u6838\u5FC3",
  "\u9875\u9762",
  "\u529F\u80FD",
  "\u65B9\u5411",
  "\u95EE\u9898",
  "\u9700\u8981",
  "\u5E94\u8BE5",
  "\u4EC0\u4E48",
  "app",
  "web"
]);
function groundingTokens(values) {
  const tokens = /* @__PURE__ */ new Set();
  for (const value of values) {
    const segments = value.toLowerCase().replace(/(?:用户原话|产品方向|产品端)：/gu, " ").split(/[^\p{Script=Han}a-z0-9]+|(?:我想|我要|希望|做|一个|一款|类似|用于|帮助|里面|里的|这个|那个)/giu).filter((segment) => segment.length >= 2);
    for (const segment of segments) {
      if (/^[a-z0-9-]+$/u.test(segment)) {
        if (!GROUNDING_STOP_WORDS.has(segment)) tokens.add(segment);
        continue;
      }
      const maxSize = Math.min(6, segment.length);
      for (let size = 2; size <= maxSize; size += 1) {
        for (let index = 0; index <= segment.length - size; index += 1) {
          const token = segment.slice(index, index + size);
          if (!GROUNDING_STOP_WORDS.has(token)) tokens.add(token);
        }
      }
    }
  }
  return tokens;
}
function validateAdaptiveQuestion(value, discovery, validationOptions = {}) {
  if (discovery.questionCount >= discovery.maxQuestions && validationOptions.allowAdjustment !== true) {
    return { ok: false, code: "question_limit_reached", message: `\u5DF2\u7ECF\u8FBE\u5230 ${discovery.maxQuestions} \u4E2A\u95EE\u9898\uFF0C\u5FC5\u987B\u8C03\u7528 action=synthesize \u6574\u7406\u9879\u76EE\u7B80\u62A5` };
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, code: "question_quality_invalid", message: "question \u5FC5\u987B\u662F\u7ED3\u6784\u5316\u5BF9\u8C61" };
  }
  const input = value;
  if (!nonEmptyString(input.id) || !/^q[0-9a-z_-]+$/iu.test(input.id)) {
    return { ok: false, code: "question_quality_invalid", message: "question.id \u5FC5\u987B\u662F\u4EE5 q \u5F00\u5934\u7684\u7A33\u5B9A\u6807\u8BC6\u7B26" };
  }
  if (!nonEmptyString(input.dimension) || !DISCOVERY_DIMENSIONS.has(input.dimension)) {
    return { ok: false, code: "question_quality_invalid", message: `question.dimension \u4E0D\u662F\u5141\u8BB8\u7684\u4EA7\u54C1\u51B3\u7B56\u7EF4\u5EA6\uFF1B\u5FC5\u987B\u4F7F\u7528\u4EE5\u4E0B\u7A33\u5B9A ID \u4E4B\u4E00\uFF1A${DISCOVERY_DIMENSION_IDS.join(", ")}` };
  }
  if (!nonEmptyString(input.insight) || input.insight.trim().length < 18) {
    return { ok: false, code: "question_quality_invalid", message: "\u6BCF\u9053\u9898\u5FC5\u987B\u5148\u63D0\u4F9B\u57FA\u4E8E\u5F53\u524D\u4EA7\u54C1\u7684\u5177\u4F53\u5224\u65AD\uFF0C\u4E0D\u80FD\u53EA\u8865\u9F50\u5B57\u6BB5" };
  }
  if (!nonEmptyString(input.text)) {
    return { ok: false, code: "question_quality_invalid", message: "question.text \u5FC5\u987B\u5305\u542B\u201C\u5224\u65AD\uFF1A...\n\n\u95EE\u9898\uFF1A...\u201D\u5E76\u53EF\u76F4\u63A5\u7528\u4E8E\u539F\u751F\u95EE\u9898\u5361\u7247" };
  }
  const presentationText = input.text.trim().replace(/\\n/gu, "\n");
  const presentationMatch = /^判断：([\s\S]+?)\s*问题：([\s\S]+)$/u.exec(presentationText);
  if (presentationMatch === null || !normalizedQuestionText(presentationMatch[1]).includes(normalizedQuestionText(input.insight.trim()))) {
    return { ok: false, code: "question_presentation_invalid", message: "question.text \u5FC5\u987B\u5B8C\u6574\u5305\u542B\u5F53\u524D insight\uFF0C\u683C\u5F0F\u4E3A\u201C\u5224\u65AD\uFF1A{insight}\n\n\u95EE\u9898\uFF1A{decision question}\u201D\uFF0C\u7981\u6B62\u5728\u5C55\u793A\u5361\u7247\u65F6\u4E22\u6389\u4EA7\u54C1\u5224\u65AD" };
  }
  const questionText = presentationMatch[2].trim();
  if (questionText.length < 6) {
    return { ok: false, code: "question_quality_invalid", message: "question.text \u4E2D\u7684\u51B3\u7B56\u95EE\u9898\u5FC5\u987B\u660E\u786E\u4E14\u53EF\u56DE\u7B54" };
  }
  const insightTokens = groundingTokens([input.insight.trim()]);
  const selfContainedQuestionTokens = groundingTokens([questionText]);
  if (![...insightTokens].some((token) => token.length >= 4 && selfContainedQuestionTokens.has(token))) {
    return { ok: false, code: "question_presentation_invalid", message: "\u201C\u95EE\u9898\uFF1A\u201D\u540E\u7684\u6587\u5B57\u4E5F\u5FC5\u987B\u81EA\u5305\u542B\u5730\u91CD\u8FF0\u5F53\u524D\u4EA7\u54C1\u5224\u65AD\u518D\u63D0\u51FA\u51B3\u7B56\uFF08\u5141\u8BB8\u540C\u4E49\u6539\u5199\uFF09\uFF0C\u907F\u514D Agent \u53EA\u622A\u53D6\u95EE\u9898\u90E8\u5206\u65F6\u4E22\u6389 insight" };
  }
  if (GENERIC_QUESTION_RE.test(questionText) || ARCHITECTURE_LIST_RE.test(questionText)) {
    return { ok: false, code: "question_quality_invalid", message: "\u4E0D\u80FD\u4F7F\u7528\u56FA\u5B9A\u7684\u7528\u6237\u3001\u76EE\u6807\u3001\u6A21\u5757\u6216\u9875\u9762\u95EE\u5377\uFF1B\u8BF7\u7ED3\u5408\u5F53\u524D\u4EA7\u54C1\u573A\u666F\u63D0\u51FA\u6709\u53D6\u820D\u7684\u95EE\u9898" };
  }
  if (!nonEmptyString(input.decisionImpact) || input.decisionImpact.trim().length < 10) {
    return { ok: false, code: "question_quality_invalid", message: "question.decisionImpact \u5FC5\u987B\u8BF4\u660E\u7B54\u6848\u4F1A\u6539\u53D8\u54EA\u9879\u4EA7\u54C1\u51B3\u7B56" };
  }
  const questionId = input.id.trim();
  const dimension = input.dimension.trim();
  const insight = input.insight.trim();
  const decisionImpact = input.decisionImpact.trim();
  const dependsOn = Array.isArray(input.dependsOn) && input.dependsOn.every(nonEmptyString) ? [...new Set(input.dependsOn.map((item) => item.trim()))] : [];
  const invalidatedQuestionIds = new Set(discovery.invalidatedQuestionIds ?? []);
  const knownQuestionIds = new Set(discovery.questions.filter((question) => !invalidatedQuestionIds.has(question.id)).map((question) => question.id));
  const unknownDependency = dependsOn.find((id) => !knownQuestionIds.has(id));
  if (unknownDependency !== void 0) {
    return { ok: false, code: "question_quality_invalid", message: `dependsOn \u5F15\u7528\u4E86\u4E0D\u5B58\u5728\u7684\u95EE\u9898 ${unknownDependency}` };
  }
  if (discovery.questions.some((question) => question.id === questionId)) {
    return { ok: false, code: "question_duplicate", message: `\u95EE\u9898 ${questionId} \u5DF2\u7ECF\u95EE\u8FC7` };
  }
  const fingerprint = normalizedQuestionText(questionText);
  if (discovery.questions.some((question) => normalizedQuestionText(question.text) === fingerprint)) {
    return { ok: false, code: "question_duplicate", message: "\u8FD9\u4E2A\u95EE\u9898\u4E0E\u5386\u53F2\u95EE\u9898\u91CD\u590D\uFF0C\u8BF7\u5BFB\u627E\u5C1A\u672A\u89E3\u51B3\u7684\u4EA7\u54C1\u51B3\u7B56" };
  }
  const sameDimension = discovery.questions.find((question) => question.dimension === dimension && !invalidatedQuestionIds.has(question.id));
  if (sameDimension !== void 0 && !dependsOn.includes(sameDimension.id)) {
    return { ok: false, code: "question_duplicate", message: `\u7EF4\u5EA6 ${input.dimension} \u5DF2\u7ECF\u8BE2\u95EE\u8FC7\uFF1B\u5982\u9700\u6DF1\u6316\uFF0C\u5FC5\u987B\u901A\u8FC7 dependsOn \u8BF4\u660E\u4F9D\u8D56` };
  }
  if (!Array.isArray(input.options)) {
    return { ok: false, code: "question_quality_invalid", message: "question.options \u5FC5\u987B\u63D0\u4F9B 2\u20134 \u4E2A\u5177\u6709\u771F\u5B9E\u53D6\u820D\u7684\u65B9\u5411\u548C\u4E09\u4E2A\u56FA\u5B9A\u63A7\u5236\u9009\u9879" };
  }
  const requiredControls = [
    ["synthesize-now", "\u76F4\u63A5\u6574\u7406\u9879\u76EE\u7B80\u62A5"],
    ["unknown", "\u8FD8\u6CA1\u60F3\u597D"],
    ["other", "\u5176\u4ED6"]
  ];
  for (const [id, label] of requiredControls) {
    const option = input.options.find((item) => objectValue(item)?.id === id);
    const object = objectValue(option);
    if (object?.label !== label || !nonEmptyString(object.description)) {
      return { ok: false, code: "question_presentation_invalid", message: `question.options \u5FC5\u987B\u663E\u5F0F\u5305\u542B ${id} / ${label} \u53CA\u8BF4\u660E\uFF0C\u4FDD\u8BC1\u539F\u751F\u95EE\u9898\u5361\u7247\u4E0D\u4F1A\u5220\u6389\u7528\u6237\u63A7\u5236\u9879` };
    }
  }
  const meaningful = input.options.filter((option) => {
    if (typeof option !== "object" || option === null || Array.isArray(option)) return false;
    const candidate = option;
    return candidate.id !== "unknown" && candidate.id !== "other" && candidate.id !== "synthesize-now";
  });
  if (meaningful.length < 2 || meaningful.length > 4) {
    return { ok: false, code: "question_quality_invalid", message: "\u6BCF\u9053\u9898\u5FC5\u987B\u63D0\u4F9B 2\u20134 \u4E2A\u4EA7\u54C1\u4E13\u5C5E\u65B9\u5411\uFF0C\u518D\u7531\u5DE5\u5177\u8865\u5145\u201C\u8FD8\u6CA1\u60F3\u597D\u201D\u548C\u201C\u5176\u4ED6\u201D" };
  }
  const options = [];
  const optionIds = /* @__PURE__ */ new Set();
  for (const item of meaningful) {
    const option = item;
    if (!nonEmptyString(option.id) || !nonEmptyString(option.label) || !nonEmptyString(option.description) || option.description.trim().length < 8) {
      return { ok: false, code: "question_quality_invalid", message: "\u6BCF\u4E2A\u9009\u9879\u90FD\u5FC5\u987B\u5305\u542B id\u3001label\uFF0C\u4EE5\u53CA\u8BF4\u660E\u4EF7\u503C\u3001\u6210\u672C\u6216\u9002\u7528\u6761\u4EF6\u7684 description" };
    }
    if (optionIds.has(option.id.trim())) return { ok: false, code: "question_quality_invalid", message: `\u9009\u9879 ${option.id.trim()} \u91CD\u590D` };
    optionIds.add(option.id.trim());
    options.push({ id: option.id.trim(), label: option.label.trim(), description: option.description.trim() });
  }
  if (!nonEmptyString(input.recommendedOptionId) || !optionIds.has(input.recommendedOptionId.trim())) {
    return { ok: false, code: "question_quality_invalid", message: "recommendedOptionId \u5FC5\u987B\u6307\u5411\u4E00\u4E2A\u771F\u5B9E\u5019\u9009\u65B9\u5411" };
  }
  const factTokens = groundingTokens([
    ...discovery.explicitFacts,
    ...discovery.resolvedDecisions,
    ...discovery.assumptions
  ]);
  const questionTokens = groundingTokens([
    insight,
    questionText,
    decisionImpact,
    ...options.flatMap((option) => [option.label, option.description ?? ""])
  ]);
  if (![...factTokens].some((token) => questionTokens.has(token))) {
    return {
      ok: false,
      code: "question_not_grounded",
      message: "\u95EE\u9898\u6CA1\u6709\u5F15\u7528\u5F53\u524D\u4EA7\u54C1\u4E8B\u5B9E\u3001\u5DF2\u6709\u7B54\u6848\u6216\u660E\u786E\u98CE\u9669\uFF1B\u8BF7\u5148\u57FA\u4E8E discovery \u4E2D\u7684\u4E8B\u5B9E\u91CD\u65B0\u63D0\u51FA\u4EA7\u54C1\u4E13\u5C5E\u95EE\u9898"
    };
  }
  if (discovery.questionCount === 0 && validationOptions.allowAdjustment !== true) {
    const highestValue = discovery.recommendedDimensions.slice(0, 2);
    if (highestValue.length > 0 && !highestValue.includes(dimension)) {
      return {
        ok: false,
        code: "question_priority_invalid",
        message: `\u7B2C\u4E00\u9898\u5E94\u5148\u6DF1\u6316\u5F53\u524D\u4EA7\u54C1\u6700\u5173\u952E\u7684 ${highestValue.join(" \u6216 ")}\uFF0C\u4E0D\u8981\u5148\u8BA9\u7528\u6237\u9009\u62E9\u6A21\u5757\u3001\u9875\u9762\u6216\u901A\u7528\u4FE1\u606F\u67B6\u6784`
      };
    }
  }
  options.push(
    { id: "synthesize-now", label: "\u76F4\u63A5\u6574\u7406\u9879\u76EE\u7B80\u62A5", description: "\u505C\u6B62\u7EE7\u7EED\u63D0\u95EE\uFF0C\u57FA\u4E8E\u5F53\u524D\u4E8B\u5B9E\u4E0E\u5F85\u9A8C\u8BC1\u5047\u8BBE\u751F\u6210\u5B8C\u6574\u7B80\u62A5\u3002" },
    { id: "unknown", label: "\u8FD8\u6CA1\u60F3\u597D", description: "\u5148\u8BB0\u5F55\u4E3A\u5F85\u9A8C\u8BC1\u5047\u8BBE\uFF0C\u4E0D\u628A\u6C89\u9ED8\u7406\u89E3\u4E3A\u6682\u505C\u6216\u53D6\u6D88\u3002" },
    { id: "other", label: "\u5176\u4ED6", description: "\u4FDD\u7559\u7528\u6237\u81EA\u5DF1\u7684\u4EA7\u54C1\u65B9\u5411\u548C\u8865\u5145\u8BF4\u660E\u3002" }
  );
  return {
    ok: true,
    question: {
      id: questionId,
      kind: "choice",
      dimension,
      insight,
      text: questionText,
      decisionImpact,
      recommendedOptionId: input.recommendedOptionId.trim(),
      dependsOn,
      selectionMode: "single",
      options,
      allowOther: true
    }
  };
}

// src/prototype-brief.ts
function objectValue2(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : null;
}
function textValue(value) {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}
function stringList(value) {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string" && item.trim() !== "")) return null;
  return value.map((item) => item.trim());
}
function viewportValue(value) {
  const object = objectValue2(value);
  if (object === null || typeof object.width !== "number" || typeof object.height !== "number") return null;
  if (!Number.isFinite(object.width) || !Number.isFinite(object.height) || object.width < 240 || object.height < 240) return null;
  return { width: object.width, height: object.height };
}
function hasGenericMock(value) {
  return /^(?:用户\s*[A-ZＡ-Ｚ]|标题|内容|示例任务|Lorem ipsum|待填|占位)$/iu.test(value.trim());
}
function hasGenericStructure(value) {
  return /^(?:顶部区域|底部区域|内容区域|内容卡片|信息模块|列表内容|若干按钮|若干卡片|按钮|卡片|列表)$/u.test(value.trim());
}
var VISUAL_OR_TECH_IMPLEMENTATION_RE = /(?:React|Vue|Svelte|Angular|Next\.?js|Tailwind|TypeScript|技术栈|前端框架|数据库实现|API\s*接口|品牌色|品牌字体|字体(?:风格|家族)|圆角(?:体系|半径|\s*\d+\s*px)|3D|拟物|扁平风)/iu;
var POSITIVE_SCOPE_RE = /(?:包含|支持|提供|接入|启用|加入|允许)/u;
function normalizedScopeConcept(value) {
  return value.replace(/(?:首版|第一版|本轮|原型|功能|能力|页面|明确|不加入|不包含|无需|暂不|推迟|延迟)/gu, "").replace(/[\s，。！？、,.!?：:；;（）()／/\-]/gu, "");
}
function parsePage(value, index, issues) {
  const object = objectValue2(value);
  if (object === null) {
    issues.push(`pages[${index}] \u5FC5\u987B\u662F\u5BF9\u8C61`);
    return null;
  }
  const id = textValue(object.id);
  const name = textValue(object.name);
  const goal = textValue(object.goal);
  const size = viewportValue(object.size);
  const structure = stringList(object.structure);
  const primaryAction = textValue(object.primaryAction);
  const secondaryActions = stringList(object.secondaryActions);
  const states = stringList(object.states);
  const navigation = stringList(object.navigation);
  const annotations = stringList(object.annotations);
  const acceptanceCriteria = stringList(object.acceptanceCriteria);
  if (id === null) issues.push(`pages[${index}].id \u4E0D\u80FD\u4E3A\u7A7A`);
  if (name === null) issues.push(`pages[${index}].name \u4E0D\u80FD\u4E3A\u7A7A`);
  if (goal === null || goal.length < 8) issues.push(`pages[${index}].goal \u5FC5\u987B\u8BF4\u660E\u7528\u6237\u6765\u5230\u9875\u9762\u540E\u7684\u6838\u5FC3\u4EFB\u52A1`);
  if (size === null) issues.push(`pages[${index}].size \u5FC5\u987B\u63D0\u4F9B\u6709\u6548\u9875\u9762\u5C3A\u5BF8`);
  if (structure === null || structure.length < 3) issues.push(`pages[${index}].structure \u81F3\u5C11\u5305\u542B 3 \u6761\u53EF\u76F4\u63A5\u7ED8\u5236\u7684\u5177\u4F53\u5185\u5BB9`);
  else {
    const generic = structure.find(hasGenericStructure);
    if (generic !== void 0) issues.push(`pages[${index}].structure \u5305\u542B\u6CDB\u5316\u5360\u4F4D\u201C${generic}\u201D\uFF0C\u5FC5\u987B\u6539\u6210\u53EF\u76F4\u63A5\u7ED8\u5236\u7684\u6807\u9898\u3001\u63A7\u4EF6\u6587\u6848\u6216\u5185\u5BB9\u7ED3\u6784`);
  }
  if (primaryAction === null) issues.push(`pages[${index}].primaryAction \u4E0D\u80FD\u4E3A\u7A7A`);
  if (secondaryActions === null) issues.push(`pages[${index}].secondaryActions \u5FC5\u987B\u662F\u5B57\u7B26\u4E32\u6570\u7EC4`);
  if (states === null) issues.push(`pages[${index}].states \u5FC5\u987B\u662F\u5B57\u7B26\u4E32\u6570\u7EC4`);
  if (navigation === null) issues.push(`pages[${index}].navigation \u5FC5\u987B\u662F\u5B57\u7B26\u4E32\u6570\u7EC4`);
  if (annotations === null) issues.push(`pages[${index}].annotations \u5FC5\u987B\u662F\u5B57\u7B26\u4E32\u6570\u7EC4`);
  if (acceptanceCriteria === null || acceptanceCriteria.length === 0) issues.push(`pages[${index}].acceptanceCriteria \u81F3\u5C11\u5305\u542B\u4E00\u9879\u9875\u9762\u4E13\u9879\u9A8C\u6536`);
  const rawGroups = Array.isArray(object.mockDataGroups) ? object.mockDataGroups : [];
  if (!Array.isArray(object.mockDataGroups)) {
    issues.push(`pages[${index}].mockDataGroups \u5FC5\u987B\u662F [{ name, items: string[] }]\uFF0C\u4E0D\u8981\u4F7F\u7528 mockData\u3001mockDataItems \u6216\u5BF9\u8C61\u8BB0\u5F55\u522B\u540D`);
  }
  const mockDataGroups = [];
  for (const [groupIndex, rawGroup] of rawGroups.entries()) {
    const group = objectValue2(rawGroup);
    const groupName = textValue(group?.name);
    const items = stringList(group?.items);
    if (groupName === null || items === null || items.length === 0) {
      issues.push(`pages[${index}].mockDataGroups[${groupIndex}] \u5FC5\u987B\u5305\u542B\u540D\u79F0\u548C\u771F\u5B9E\u6570\u636E`);
      continue;
    }
    if (items.some(hasGenericMock)) issues.push(`pages[${index}].mockDataGroups[${groupIndex}] \u5305\u542B\u65E0\u610F\u4E49\u5360\u4F4D\u5185\u5BB9`);
    mockDataGroups.push({ name: groupName, items });
  }
  const mockCount = mockDataGroups.reduce((sum, group) => sum + group.items.length, 0);
  if (mockCount < 3) issues.push(`pages[${index}] \u81F3\u5C11\u9700\u8981 3 \u6761\u9996\u6B21\u6E32\u67D3\u53EF\u89C1\u7684\u771F\u5B9E mock \u6570\u636E\u6216\u8868\u5355\u5B57\u6BB5`);
  if ([id, name, goal, size, structure, primaryAction, secondaryActions, states, navigation, annotations, acceptanceCriteria].some((item) => item === null)) return null;
  return {
    id,
    name,
    goal,
    size,
    structure,
    primaryAction,
    secondaryActions,
    mockDataGroups,
    states,
    navigation,
    annotations,
    acceptanceCriteria
  };
}
function parseRelation(value, index, issues) {
  const object = objectValue2(value);
  if (object === null) {
    issues.push(`pageRelations[${index}] \u5FC5\u987B\u662F\u5BF9\u8C61`);
    return null;
  }
  const fromPageId = textValue(object.fromPageId);
  const toPageId = textValue(object.toPageId);
  const trigger = textValue(object.trigger);
  const result = textValue(object.result);
  const label = textValue(object.label);
  const arrowStyle = object.arrowStyle === "solid" || object.arrowStyle === "dashed" ? object.arrowStyle : null;
  if (fromPageId === null || toPageId === null || trigger === null || result === null || label === null || arrowStyle === null) {
    issues.push(`pageRelations[${index}] \u5FC5\u987B\u5B8C\u6574\u8BF4\u660E\u6765\u6E90\u3001\u76EE\u6807\u3001\u89E6\u53D1\u52A8\u4F5C\u3001\u7ED3\u679C\u3001\u7BAD\u5934\u6837\u5F0F\u548C\u6807\u7B7E`);
    return null;
  }
  return { fromPageId, toPageId, trigger, result, label, arrowStyle };
}
function semanticComponents(page) {
  const components = [
    { kind: "page-header", role: "page-heading", purpose: "\u8BF4\u660E\u9875\u9762\u8EAB\u4EFD\u4E0E\u5F53\u524D\u4E0A\u4E0B\u6587", requiredParts: ["\u53EF\u8BFB\u9875\u9762\u6807\u9898", "\u5FC5\u8981\u7684\u65E5\u671F\u6216\u72B6\u6001\u4E0A\u4E0B\u6587"] },
    { kind: "primary-action", role: "primary-action", purpose: "\u7A81\u51FA\u9875\u9762\u552F\u4E00\u4E3B\u8981\u64CD\u4F5C", requiredParts: [page.primaryAction, "\u5C45\u4E2D\u7684\u53EF\u8BFB\u6309\u94AE\u6587\u5B57"] }
  ];
  if (page.mockDataGroups.length > 0) components.push({ kind: "content-card", role: "content-card", purpose: "\u627F\u8F7D\u771F\u5B9E\u4E1A\u52A1\u5185\u5BB9", requiredParts: ["\u5BF9\u8C61\u6807\u9898", "\u72B6\u6001\u3001\u65F6\u95F4\u6216\u5173\u952E\u4E0A\u4E0B\u6587", "\u9996\u6B21\u6E32\u67D3\u53EF\u89C1\u7684 mock \u6570\u636E"] });
  if (page.navigation.length > 0) components.push({ kind: "bottom-navigation", role: "bottom-navigation", purpose: "\u8868\u8FBE\u5168\u5C40\u9875\u9762\u5207\u6362", requiredParts: ["\u5B8C\u6574\u680F\u76EE\u6587\u5B57", "\u6E05\u695A\u7684\u5F53\u524D\u9009\u4E2D\u9879", "\u5E95\u90E8\u5B89\u5168\u533A\u5185\u5BF9\u9F50"] });
  return components;
}
function chineseNumber(index) {
  return ["\u4E00", "\u4E8C", "\u4E09", "\u56DB", "\u4E94", "\u516D", "\u4E03", "\u516B", "\u4E5D", "\u5341"][index] ?? String(index + 1);
}
function bullets(items) {
  return items.map((item) => `- ${item}`).join("\n");
}
function renderPrototypeBriefMarkdown(brief) {
  const layout = brief.prototypeLayout;
  const pages = brief.pages.map((page, index) => {
    const mock = page.mockDataGroups.map((group) => `- ${group.name}
${group.items.map((item) => `  - \`${item}\``).join("\n")}`).join("\n");
    const interactions = [
      `\u4E3B\u64CD\u4F5C\uFF1A${page.primaryAction}`,
      ...page.secondaryActions.map((item) => `\u6B21\u8981\u64CD\u4F5C\uFF1A${item}`),
      ...page.states,
      ...page.navigation.map((item) => `\u5BFC\u822A\uFF1A${item}`),
      ...page.annotations.map((item) => `\u4EA4\u4E92\u6807\u6CE8\uFF1A${item}`)
    ];
    return [
      `### \u9875\u9762${chineseNumber(index)}\uFF1A${page.name}`,
      "",
      `\u9875\u9762\u76EE\u6807\uFF1A${page.goal}`,
      "",
      "\u9875\u9762\u7ED3\u6784\uFF1A",
      "",
      bullets(page.structure),
      "",
      "\u771F\u5B9E mock \u6570\u636E\uFF1A",
      "",
      mock,
      "",
      "\u5173\u952E\u72B6\u6001\u4E0E\u4EA4\u4E92\uFF1A",
      "",
      bullets(interactions),
      "",
      "\u9875\u9762\u4E13\u9879\u9A8C\u6536\uFF1A",
      "",
      bullets(page.acceptanceCriteria)
    ].join("\n");
  }).join("\n\n");
  const relations = brief.pageRelations.map((relation) => {
    const from2 = brief.pages.find((page) => page.id === relation.fromPageId)?.name ?? relation.fromPageId;
    const to = brief.pages.find((page) => page.id === relation.toPageId)?.name ?? relation.toPageId;
    const style = relation.arrowStyle === "dashed" ? "\u865A\u7EBF\u7BAD\u5934" : "\u5B9E\u7EBF\u7BAD\u5934";
    return `${from2} \u2192 ${to}\uFF1A${relation.trigger}\uFF1B${relation.result}\uFF08${style}\uFF1A${relation.label}\uFF09`;
  });
  return [
    `# ${brief.title.replace(/原型$/u, "")}\u539F\u578B`,
    "",
    "## \u4EA7\u54C1\u5B9A\u4E49",
    "",
    brief.productDefinition,
    "",
    `\u6838\u5FC3\u7528\u6237\uFF1A${brief.target}`,
    "",
    `\u6838\u5FC3\u4F7F\u7528\u573A\u666F\uFF1A${brief.coreScenario}`,
    "",
    `\u6838\u5FC3\u7ED3\u679C\uFF1A${brief.coreOutcome}`,
    "",
    "\u6838\u5FC3\u4EAE\u70B9\u4E0E\u72EC\u7279\u673A\u5236\uFF1A",
    "",
    bullets(brief.uniqueMechanism),
    "",
    "\u9996\u7248\u6838\u5FC3\u6D41\u7A0B\uFF1A",
    "",
    bullets(brief.firstVersionFlow),
    "",
    "\u9996\u7248\u5305\u542B\uFF1A",
    "",
    bullets(brief.includedScope),
    "",
    "\u9996\u7248\u660E\u786E\u4E0D\u5305\u542B\uFF1A",
    "",
    bullets(brief.excludedScope),
    "",
    "## \u539F\u578B\u7ED3\u6784",
    "",
    `\u5728\u5F53\u524D\u753B\u677F\u4E2D\u6309\u7167${layout.arrangement}\u7ED8\u5236 ${brief.pages.length} \u4E2A \`${layout.viewport.width} \xD7 ${layout.viewport.height}\` \u7684${layout.platform}\u9875\u9762\u3002${layout.connectionStyle}${layout.comprehensionGoal}`,
    "",
    pages,
    "",
    "## \u9875\u9762\u5173\u7CFB\u4E0E\u4EA4\u4E92\u8868\u8FBE",
    "",
    bullets(relations),
    "",
    "## \u539F\u578B\u8868\u8FBE\u539F\u5219",
    "",
    bullets(brief.prototypePrinciples),
    "",
    "## \u9A8C\u6536\u65B9\u5F0F",
    "",
    bullets(brief.acceptanceCriteria),
    "",
    "## \u9ED8\u8BA4\u5047\u8BBE",
    "",
    bullets(brief.assumptions),
    ...brief.pendingDecisions.length === 0 ? [] : ["", "\u5C1A\u5F85\u51B3\u5B9A\uFF1A", "", bullets(brief.pendingDecisions)]
  ].join("\n");
}
function validatePrototypeBrief(value, deferredStyleNote) {
  const issues = [];
  const object = objectValue2(value);
  if (object === null) return { ok: false, code: "brief_quality_invalid", message: "PrototypeBrief \u5FC5\u987B\u662F\u7ED3\u6784\u5316\u5BF9\u8C61", issues: ["brief \u4E0D\u662F\u5BF9\u8C61"] };
  const title = textValue(object.title);
  const productDefinition = textValue(object.productDefinition);
  const target = textValue(object.target);
  const coreScenario = textValue(object.coreScenario);
  const coreOutcome = textValue(object.coreOutcome);
  const uniqueMechanism = stringList(object.uniqueMechanism);
  const firstVersionFlow = stringList(object.firstVersionFlow);
  const includedScope = stringList(object.includedScope);
  const excludedScope = stringList(object.excludedScope);
  const prototypePrinciples = stringList(object.prototypePrinciples);
  const acceptanceCriteria = stringList(object.acceptanceCriteria);
  const assumptions = stringList(object.assumptions);
  const pendingDecisions = stringList(object.pendingDecisions);
  if (title === null) issues.push("title \u4E0D\u80FD\u4E3A\u7A7A");
  if (productDefinition === null || productDefinition.length < 30) issues.push("productDefinition \u5FC5\u987B\u7528\u5B8C\u6574\u81EA\u7136\u8BED\u8A00\u5B9A\u4E49\u4EA7\u54C1\u3001\u6838\u5FC3\u6D41\u7A0B\u548C\u9996\u7248\u53D6\u820D");
  if (target === null) issues.push("target \u4E0D\u80FD\u4E3A\u7A7A");
  if (coreScenario === null) issues.push("coreScenario \u4E0D\u80FD\u4E3A\u7A7A");
  if (coreOutcome === null) issues.push("coreOutcome \u4E0D\u80FD\u4E3A\u7A7A");
  if (uniqueMechanism === null || uniqueMechanism.length === 0) issues.push("uniqueMechanism \u81F3\u5C11\u5305\u542B\u4E00\u4E2A\u4EA7\u54C1\u4EAE\u70B9\uFF0C\u6216\u660E\u786E\u8BF4\u660E\u9996\u7248\u5C1A\u672A\u5F62\u6210\u5DEE\u5F02\u5316");
  if (firstVersionFlow === null || firstVersionFlow.length < 2) issues.push("firstVersionFlow \u81F3\u5C11\u5305\u542B\u4E24\u4E2A\u8FDE\u7EED\u6B65\u9AA4");
  if (includedScope === null || includedScope.length === 0) issues.push("includedScope \u4E0D\u80FD\u4E3A\u7A7A");
  if (excludedScope === null || excludedScope.length === 0) issues.push("excludedScope \u4E0D\u80FD\u4E3A\u7A7A");
  if (prototypePrinciples === null || prototypePrinciples.length < 3) issues.push("prototypePrinciples \u81F3\u5C11\u5305\u542B 3 \u6761\u539F\u578B\u8868\u8FBE\u539F\u5219");
  if (acceptanceCriteria === null || acceptanceCriteria.length < 5) issues.push("acceptanceCriteria \u81F3\u5C11\u5305\u542B 5 \u6761\u53EF\u9A8C\u8BC1\u6807\u51C6");
  if (assumptions === null || assumptions.length === 0) issues.push("assumptions \u4E0D\u80FD\u4E3A\u7A7A");
  if (pendingDecisions === null) issues.push("pendingDecisions \u5FC5\u987B\u662F\u5B57\u7B26\u4E32\u6570\u7EC4");
  const layoutObject = objectValue2(object.prototypeLayout);
  const viewport = viewportValue(layoutObject?.viewport);
  const platform = textValue(layoutObject?.platform);
  const arrangement = textValue(layoutObject?.arrangement);
  const connectionStyle = textValue(layoutObject?.connectionStyle);
  const representativePageId = textValue(layoutObject?.representativePageId);
  const comprehensionGoal = textValue(layoutObject?.comprehensionGoal);
  if (layoutObject === null || viewport === null || platform === null || arrangement === null || connectionStyle === null || representativePageId === null || comprehensionGoal === null) {
    issues.push("prototypeLayout \u5FC5\u987B\u5B8C\u6574\u8BF4\u660E\u5E73\u53F0\u3001\u5C3A\u5BF8\u3001\u6392\u5217\u3001\u8FDE\u7EBF\u3001\u4EE3\u8868\u9875\u548C 5 \u79D2\u7406\u89E3\u76EE\u6807");
  }
  const rawPages = Array.isArray(object.pages) ? object.pages : [];
  if (rawPages.length === 0) issues.push("pages \u81F3\u5C11\u5305\u542B\u4E00\u4E2A\u9875\u9762");
  const pages = rawPages.map((page, index) => parsePage(page, index, issues)).filter((page) => page !== null);
  const pageIds = /* @__PURE__ */ new Set();
  const pageNames = /* @__PURE__ */ new Set();
  for (const page of pages) {
    if (pageIds.has(page.id)) issues.push(`\u9875\u9762 id ${page.id} \u91CD\u590D`);
    pageIds.add(page.id);
    if (pageNames.has(page.name)) issues.push(`\u9875\u9762\u540D\u79F0 ${page.name} \u91CD\u590D`);
    pageNames.add(page.name);
  }
  if (representativePageId !== null && !pageIds.has(representativePageId)) issues.push("prototypeLayout.representativePageId \u5FC5\u987B\u5F15\u7528\u771F\u5B9E\u9875\u9762");
  const rawRelations = Array.isArray(object.pageRelations) ? object.pageRelations : [];
  const pageRelations = rawRelations.map((relation, index) => parseRelation(relation, index, issues)).filter((relation) => relation !== null);
  if (pages.length > 1 && pageRelations.length === 0) issues.push("\u591A\u9875\u9762\u539F\u578B\u5FC5\u987B\u81F3\u5C11\u63D0\u4F9B\u4E00\u6761\u660E\u786E\u7684\u9875\u9762\u5173\u7CFB");
  for (const relation of pageRelations) {
    if (!pageIds.has(relation.fromPageId) || !pageIds.has(relation.toPageId)) issues.push(`\u9875\u9762\u5173\u7CFB ${relation.label} \u5F15\u7528\u4E86\u4E0D\u5B58\u5728\u7684\u9875\u9762`);
  }
  if (acceptanceCriteria !== null) {
    const corpus = acceptanceCriteria.join("\uFF1B");
    const required = [
      [/可见|文字/u, "\u6587\u5B57\u9996\u6B21\u6E32\u67D3\u53EF\u89C1"],
      [/裁切|越界/u, "\u9875\u9762\u548C\u7EC4\u4EF6\u65E0\u88C1\u5207\u6216\u8D8A\u754C"],
      [/按钮.*居中|居中.*按钮/u, "\u6309\u94AE\u6587\u6848\u5C45\u4E2D"],
      [/导航/u, "\u5E95\u90E8\u5BFC\u822A\u5B8C\u6574\u5BF9\u9F50"],
      [/流程|交互|箭头/u, "\u6838\u5FC3\u6D41\u7A0B\u6216\u4EA4\u4E92\u5173\u7CFB"]
    ];
    for (const [pattern2, label] of required) if (!pattern2.test(corpus)) issues.push(`acceptanceCriteria \u7F3A\u5C11\u201C${label}\u201D\u9A8C\u6536`);
  }
  const implementationCorpus = [
    productDefinition ?? "",
    ...uniqueMechanism ?? [],
    ...firstVersionFlow ?? [],
    ...includedScope ?? [],
    ...prototypePrinciples ?? [],
    ...pages.flatMap((page) => [...page.structure, ...page.states, ...page.navigation, ...page.annotations])
  ].join("\uFF1B");
  if (VISUAL_OR_TECH_IMPLEMENTATION_RE.test(implementationCorpus)) {
    issues.push("\u539F\u578B\u7B80\u62A5\u4E0D\u80FD\u89C4\u5B9A\u54C1\u724C\u89C6\u89C9\u6216\u524D\u7AEF\u6280\u672F\u5B9E\u73B0\uFF1B\u8BF7\u628A\u989C\u8272\u4F53\u7CFB\u3001\u5B57\u4F53\u3001\u5706\u89D2\u548C\u6280\u672F\u6808\u63A8\u8FDF\u5230 Generate");
  }
  if (excludedScope !== null && assumptions !== null) {
    const contradiction = assumptions.find((assumption) => {
      if (!POSITIVE_SCOPE_RE.test(assumption)) return false;
      const normalizedAssumption = normalizedScopeConcept(assumption);
      return excludedScope.some((excluded) => {
        const concept = normalizedScopeConcept(excluded);
        return concept.length >= 2 && normalizedAssumption.includes(concept);
      });
    });
    if (contradiction !== void 0) issues.push(`\u9ED8\u8BA4\u5047\u8BBE\u201C${contradiction}\u201D\u4E0E\u9996\u7248\u660E\u786E\u6392\u9664\u8303\u56F4\u77DB\u76FE`);
  }
  if (issues.length > 0 || title === null || productDefinition === null || target === null || coreScenario === null || coreOutcome === null || uniqueMechanism === null || firstVersionFlow === null || includedScope === null || excludedScope === null || viewport === null || platform === null || arrangement === null || connectionStyle === null || representativePageId === null || comprehensionGoal === null || prototypePrinciples === null || acceptanceCriteria === null || assumptions === null || pendingDecisions === null) {
    return { ok: false, code: "brief_quality_invalid", message: `\u9879\u76EE\u7B80\u62A5\u672A\u901A\u8FC7\u8D28\u91CF\u95E8\u7981\uFF1A${issues.join("\uFF1B")}`, issues };
  }
  const canonical = {
    title,
    productDefinition,
    target,
    coreScenario,
    coreOutcome,
    uniqueMechanism,
    firstVersionFlow,
    includedScope,
    excludedScope,
    prototypeLayout: { platform, viewport, arrangement, connectionStyle, representativePageId, comprehensionGoal },
    pages,
    pageRelations,
    prototypePrinciples,
    acceptanceCriteria,
    assumptions,
    pendingDecisions
  };
  const brief = {
    ...canonical,
    briefSchemaVersion: 2,
    pageBlueprints: pages.map((page) => ({
      pageId: page.id,
      page: page.name,
      coreTask: page.goal,
      primaryAction: page.primaryAction,
      aboveFold: [...page.structure.slice(0, 3), `\u552F\u4E00\u4E3B\u8981\u64CD\u4F5C\uFF1A${page.primaryAction}`],
      semanticComponents: semanticComponents(page)
    })),
    pageMockData: pages.map((page) => ({
      pageId: page.id,
      page: page.name,
      minimumRecords: 3,
      requiredContent: page.structure,
      examples: page.mockDataGroups.flatMap((group) => group.items)
    })),
    mockDataPolicy: {
      rule: "\u5217\u8868\u3001\u804A\u5929\u3001\u56FE\u8868\u3001\u8BE6\u60C5\u548C\u72B6\u6001\u7EC4\u4EF6\u5FC5\u987B\u5C55\u793A\u771F\u5B9E\u793A\u4F8B\u5185\u5BB9\uFF0C\u4E0D\u80FD\u4F7F\u7528\u7A7A\u767D\u65B9\u6846\u3001Lorem ipsum\u3001\u7528\u6237A\u6216\u65E0\u542B\u4E49\u5360\u4F4D\u7B26\u4EE3\u66FF",
      minimumRecordsPerRepeatedComponent: 3,
      visibility: "mock \u6570\u636E\u5FC5\u987B\u4F7F\u7528\u9996\u6B21\u6E32\u67D3\u5373\u53EF\u89C1\u7684\u72EC\u7ACB text \u5143\u7D20"
    },
    prototypeQualityPolicy: {
      firstScreen: canonical.prototypeLayout.comprehensionGoal,
      hierarchy: "\u6BCF\u9875\u53EA\u6709\u4E00\u4E2A primary-action\uFF1B\u6807\u9898\u3001\u6B63\u6587\u548C\u8F85\u52A9\u4FE1\u606F\u5F62\u6210\u6E05\u695A\u5C42\u7EA7",
      completionRule: "writeVerified=true \u53EA\u4EE3\u8868\u5199\u5165\u4E00\u81F4\uFF1B\u9010\u6761\u901A\u8FC7\u672C\u7B80\u62A5 acceptanceCriteria \u540E\u624D\u80FD\u5BA3\u5E03\u5B8C\u6210"
    },
    interactions: pageRelations.map((relation) => `${relation.fromPageId} \u2192 ${relation.toPageId}\uFF1A${relation.trigger}\uFF1B${relation.result}`),
    deferredStyleNote
  };
  return { ok: true, brief, markdown: renderPrototypeBriefMarkdown(canonical) };
}

// src/create-contract.ts
var CREATE_ACTIONS = [
  "start",
  "propose_question",
  "synthesize",
  "answer",
  "skip",
  "revise",
  "rename",
  "resume",
  "list",
  "confirm",
  "abandon",
  "archive"
];

// src/create-tool.ts
function text(value) {
  return [{ type: "text", text: value }];
}
function continuation(value) {
  return [
    "[draw2code_create continuation]",
    `sessionId=${value.sessionId ?? ""}`,
    `revision=${value.revision ?? ""}`
  ].join(" ");
}
function clone3(value) {
  return JSON.parse(JSON.stringify(value));
}
function normalizeStructuredArg(value) {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, entry]) => [key, canonicalValue(entry)]));
}
var PROJECT_NAME_MAX_LENGTH = 16;
var PROJECT_NAME_RE = /^[\w\u4e00-\u9fa5][\w\u4e00-\u9fa5 -]*$/u;
function normalizeProjectName(value) {
  return value.trim().replace(/\s+/gu, " ");
}
function projectNameValidationError(value, rawIdea) {
  if (value === "") return "projectName \u4E0D\u80FD\u4E3A\u7A7A";
  if (rawIdea !== void 0 && value === normalizeProjectName(rawIdea)) {
    return "projectName \u4E0D\u80FD\u76F4\u63A5\u590D\u5236\u5B8C\u6574 idea\uFF1B\u8BF7\u7406\u89E3\u5B8C\u6574\u9700\u6C42\u540E\u91CD\u65B0\u6982\u62EC\u4EA7\u54C1\u540D\u79F0";
  }
  if (value.length > PROJECT_NAME_MAX_LENGTH) {
    return `projectName \u6700\u591A ${PROJECT_NAME_MAX_LENGTH} \u4E2A\u5B57\u7B26\uFF1B\u8BF7\u57FA\u4E8E\u5B8C\u6574\u9700\u6C42\u91CD\u65B0\u6982\u62EC\uFF0C\u4E0D\u8981\u622A\u53D6\u539F\u8BDD\u524D ${PROJECT_NAME_MAX_LENGTH} \u4E2A\u5B57\u7B26`;
  }
  if (/(?:\s*-\s*)?原型$/u.test(value)) return "projectName \u53EA\u5199\u4EA7\u54C1\u540D\u79F0\uFF0C\u4E0D\u8981\u6DFB\u52A0\u201C\u539F\u578B\u201D\u540E\u7F00";
  if (!PROJECT_NAME_RE.test(value)) return "projectName \u53EA\u80FD\u5305\u542B\u4E2D\u82F1\u6587\u3001\u6570\u5B57\u3001\u7A7A\u683C\u3001\u8FDE\u5B57\u7B26\u548C\u4E0B\u5212\u7EBF";
  return null;
}
function boardNameFromProject(projectName, existing) {
  const base = projectName;
  if (!existing.has(base)) return base;
  for (let index = 2; index < 1e3; index += 1) {
    const candidate = `${base} ${index}`;
    if (!existing.has(candidate)) return candidate;
  }
  return `${base} ${Date.now()}`;
}
function requestKey(args) {
  return JSON.stringify(canonicalValue({
    action: args.action,
    sessionId: args.sessionId ?? null,
    revision: args.revision ?? null,
    questionId: args.questionId ?? null,
    values: args.values ?? [],
    otherText: args.otherText ?? null,
    projectName: args.projectName ?? null,
    question: normalizeStructuredArg(args.question) ?? null,
    brief: normalizeStructuredArg(args.brief) ?? null,
    stopReason: args.stopReason ?? null
  }));
}
function draftStatus(draft) {
  if (draft.status === "draft") {
    if (draft.currentQuestion !== null) return "question";
    if (draft.brief !== null) return "ready";
    if (draft.flowVersion === CREATE_FLOW_VERSION) return "discovery";
    return "ready";
  }
  return draft.status;
}
var CREATE_DIMENSION_HEADERS = {
  "trigger-context": "\u6838\u5FC3\u573A\u666F",
  "existing-alternative": "\u73B0\u6709\u66FF\u4EE3",
  "core-outcome": "\u6838\u5FC3\u7ED3\u679C",
  "unique-mechanism": "\u72EC\u7279\u673A\u5236",
  "core-loop": "\u4F7F\u7528\u95ED\u73AF",
  "critical-risk": "\u5173\u952E\u98CE\u9669",
  "scope-proof": "\u9996\u7248\u9A8C\u8BC1",
  "target-user": "\u6838\u5FC3\u7528\u6237",
  "target-platform": "\u4EA7\u54C1\u7AEF",
  "product-architecture": "\u4EA7\u54C1\u7ED3\u6784"
};
function hostQuestionFor(question) {
  const prompt = question.insight === void 0 ? question.text : `\u5224\u65AD\uFF1A${question.insight}

\u95EE\u9898\uFF1A${question.text}`;
  return {
    questions: [{
      id: question.id,
      question: prompt,
      header: CREATE_DIMENSION_HEADERS[question.dimension ?? ""] ?? "\u4EA7\u54C1\u51B3\u7B56",
      options: question.options.map((option) => ({ label: option.label, description: option.description ?? "" })),
      multi_select: question.selectionMode === "multiple"
    }]
  };
}
function displayedQuestionText(question) {
  return question.insight === void 0 ? question.text : `\u5224\u65AD\uFF1A${question.insight}

\u95EE\u9898\uFF1A${question.text}`;
}
function readyPageNames(brief) {
  if (typeof brief !== "object" || brief === null || Array.isArray(brief)) return [];
  const pages = brief.pages;
  if (!Array.isArray(pages)) return [];
  return pages.flatMap((page) => {
    if (typeof page !== "object" || page === null || Array.isArray(page)) return [];
    const name = page.name;
    return typeof name === "string" && name.trim() !== "" ? [name.trim()] : [];
  });
}
function createConfirmation(brief) {
  const pageNames = readyPageNames(brief);
  const pageSummary = pageNames.length === 0 ? "\u9879\u76EE\u7B80\u62A5\u4E2D\u7684\u9875\u9762\u8303\u56F4" : `${pageNames.length} \u4E2A\u9875\u9762\uFF1A${pageNames.join("\u3001")}`;
  const question = `\u8BA1\u5212\u7ED8\u5236${pageSummary}\u3002\u8FD9\u4E9B\u5C31\u662F\u9996\u7248\u539F\u578B\u9700\u8981\u751F\u6210\u7684\u9875\u9762\u5417\uFF1F`;
  return {
    id: "create-brief-confirm",
    pageNames,
    question,
    options: [
      { id: "confirm", label: "\u786E\u8BA4\u8FD9\u4E9B\u9875\u9762\u5E76\u7ED8\u5236", description: "\u4F7F\u7528\u521A\u521A\u5C55\u793A\u7684\u540C\u4E00\u4EFD\u9879\u76EE\u7B80\u62A5\u548C\u9875\u9762\u8303\u56F4\u521B\u5EFA\u72EC\u7ACB\u753B\u677F\u3002" },
      { id: "adjust-pages", label: "\u8C03\u6574\u9875\u9762\u8303\u56F4", description: "\u589E\u5220\u3001\u5408\u5E76\u6216\u62C6\u5206\u9875\u9762\uFF0C\u518D\u91CD\u65B0\u751F\u6210\u5B8C\u6574\u9879\u76EE\u7B80\u62A5\u3002" },
      { id: "adjust-direction", label: "\u8C03\u6574\u4EA7\u54C1\u65B9\u5411", description: "\u53EA\u8FFD\u95EE\u53D7\u5F71\u54CD\u7684\u4EA7\u54C1\u51B3\u7B56\uFF0C\u518D\u91CD\u65B0\u751F\u6210\u5B8C\u6574\u7B80\u62A5\u3002" }
    ],
    askUserQuestionArgs: {
      questions: [{
        id: "create-brief-confirm",
        question,
        header: "\u9875\u9762\u786E\u8BA4",
        options: [
          { label: "\u786E\u8BA4\u8FD9\u4E9B\u9875\u9762\u5E76\u7ED8\u5236", description: "\u4F7F\u7528\u521A\u521A\u5C55\u793A\u7684\u540C\u4E00\u4EFD\u9879\u76EE\u7B80\u62A5\u548C\u9875\u9762\u8303\u56F4\u521B\u5EFA\u72EC\u7ACB\u753B\u677F\u3002" },
          { label: "\u8C03\u6574\u9875\u9762\u8303\u56F4", description: "\u589E\u5220\u3001\u5408\u5E76\u6216\u62C6\u5206\u9875\u9762\uFF0C\u518D\u91CD\u65B0\u751F\u6210\u5B8C\u6574\u9879\u76EE\u7B80\u62A5\u3002" },
          { label: "\u8C03\u6574\u4EA7\u54C1\u65B9\u5411", description: "\u53EA\u8FFD\u95EE\u53D7\u5F71\u54CD\u7684\u4EA7\u54C1\u51B3\u7B56\uFF0C\u518D\u91CD\u65B0\u751F\u6210\u5B8C\u6574\u7B80\u62A5\u3002" }
        ],
        multi_select: false
      }]
    }
  };
}
function createDrawingPlan(brief) {
  if (typeof brief !== "object" || brief === null || Array.isArray(brief)) {
    return { mode: "single-batch", nextActionCode: "write_pages", allowedPageIds: [], remainingPageIds: [] };
  }
  const value = brief;
  const pageIds = Array.isArray(value.pages) ? value.pages.flatMap((page) => {
    if (typeof page !== "object" || page === null || Array.isArray(page)) return [];
    const id = page.id;
    return typeof id === "string" && id.trim() !== "" ? [id.trim()] : [];
  }) : [];
  const layout = typeof value.prototypeLayout === "object" && value.prototypeLayout !== null && !Array.isArray(value.prototypeLayout) ? value.prototypeLayout : {};
  const requestedRepresentative = typeof layout.representativePageId === "string" ? layout.representativePageId : "";
  const representativePageId = pageIds.includes(requestedRepresentative) ? requestedRepresentative : pageIds[0];
  const phased = pageIds.length >= 3 && representativePageId !== void 0;
  return {
    mode: phased ? "representative-first" : "single-batch",
    nextActionCode: phased ? "write_representative" : "write_pages",
    ...representativePageId === void 0 ? {} : { representativePageId },
    allowedPageIds: phased ? [representativePageId] : pageIds,
    remainingPageIds: phased ? pageIds.filter((id) => id !== representativePageId) : []
  };
}
function prototypeBriefContract() {
  return {
    requiredTopLevel: [
      "title",
      "productDefinition",
      "target",
      "coreScenario",
      "coreOutcome",
      "uniqueMechanism",
      "firstVersionFlow",
      "includedScope",
      "excludedScope",
      "prototypeLayout",
      "pages",
      "pageRelations",
      "prototypePrinciples",
      "acceptanceCriteria",
      "assumptions",
      "pendingDecisions"
    ],
    prototypeLayout: ["platform", "viewport: { width, height }", "arrangement", "connectionStyle", "representativePageId", "comprehensionGoal"],
    page: [
      "id",
      "name",
      "goal",
      "size: { width, height }",
      "structure: string[]",
      "primaryAction",
      "secondaryActions: string[]",
      "mockDataGroups: Array<{ name: string, items: string[] }>",
      "states: string[]",
      "navigation: string[]",
      "annotations: string[]",
      "acceptanceCriteria: string[]"
    ],
    pageRelation: ["fromPageId", "toPageId", "trigger", "result", "arrowStyle: solid|dashed", "label"],
    rules: [
      "structure \u53EA\u80FD\u653E\u53EF\u76F4\u63A5\u7ED8\u5236\u7684\u5177\u4F53\u5B57\u7B26\u4E32\uFF0C\u4E0D\u653E\u7EC4\u4EF6\u5BF9\u8C61",
      "\u6BCF\u9875\u901A\u8FC7 mockDataGroups \u63D0\u4F9B\u81F3\u5C11 3 \u6761\u771F\u5B9E\u53EF\u89C1\u6570\u636E\u6216\u5B8C\u6574\u8868\u5355\u5B57\u6BB5",
      "\u591A\u9875\u9762\u81F3\u5C11\u4E00\u6761 pageRelations\uFF0C\u4E14\u9875\u9762 ID \u5FC5\u987B\u5B58\u5728",
      "\u539F\u578B\u9636\u6BB5\u4E0D\u5199\u54C1\u724C\u8272\u3001\u5B57\u4F53\u3001\u5706\u89D2\u30013D \u6216\u524D\u7AEF\u6280\u672F\u6808"
    ]
  };
}
function responseFor(projects, draft, extras = {}) {
  const status = draftStatus(draft);
  const response = {
    status,
    ...draft.flowVersion === void 0 ? {} : { flowVersion: draft.flowVersion },
    sessionId: draft.projectId,
    projectId: draft.projectId,
    projectName: draft.projectName,
    projectFile: projects.fileName(draft.projectId),
    revision: draft.revision,
    ...draft.currentQuestion === null ? {} : {
      question: {
        ...draft.currentQuestion,
        text: displayedQuestionText(draft.currentQuestion),
        askUserQuestionArgs: hostQuestionFor(draft.currentQuestion)
      }
    },
    ...draft.discovery === void 0 ? {} : { discovery: draft.discovery },
    ...draft.brief === null ? {} : { brief: draft.brief, assumptions: draft.brief.assumptions ?? [] },
    ...draft.briefMarkdown === void 0 || draft.briefMarkdown === null ? {} : { briefMarkdown: draft.briefMarkdown },
    ...draft.flowVersion === CREATE_FLOW_VERSION && draft.status === "draft" ? { briefContract: prototypeBriefContract() } : {},
    ...status === "ready" ? { confirmation: createConfirmation(draft.brief) } : {},
    ...status === "confirmed" && draft.brief !== null ? { drawingPlan: createDrawingPlan(draft.brief) } : {},
    ...draft.boardName === null ? {} : { boardName: draft.boardName },
    ...extras
  };
  return response;
}
function errorResponse(code, message, current) {
  return {
    status: "error",
    error: { code, message, recoverable: code !== "invalid_action" },
    ...current === void 0 ? {} : {
      current: {
        sessionId: current.projectId,
        revision: current.revision,
        status: draftStatus(current),
        question: current.currentQuestion
      }
    }
  };
}
function questionFromDraft(draft, questionId) {
  if (draft.currentQuestion !== null && draft.currentQuestion.id === questionId) {
    return draft.currentQuestion;
  }
  if (draft.flowVersion === CREATE_FLOW_VERSION && draft.discovery !== void 0) {
    const discovery = draft.discovery;
    if ((discovery.invalidatedQuestionIds ?? []).includes(questionId)) return null;
    return discovery.questions.find((question) => question.id === questionId) ?? null;
  }
  return questionById(draft.originalIdea, questionId);
}
function validateValues(question, values, otherText) {
  if (values.length === 0) return "\u81F3\u5C11\u9009\u62E9\u4E00\u4E2A\u7B54\u6848";
  if (question.selectionMode === "single" && values.length !== 1) return "\u8FD9\u4E2A\u95EE\u9898\u53EA\u80FD\u9009\u62E9\u4E00\u4E2A\u7B54\u6848";
  if (question.minSelections !== void 0 && values.length < question.minSelections) return `\u81F3\u5C11\u9009\u62E9 ${question.minSelections} \u9879`;
  if (question.maxSelections !== void 0 && values.length > question.maxSelections) return `\u6700\u591A\u9009\u62E9 ${question.maxSelections} \u9879`;
  const allowed = new Set(question.options.map((option) => option.id));
  const invalid = values.find((value) => !allowed.has(value));
  if (invalid !== void 0) return `\u9009\u9879 "${invalid}" \u4E0D\u5728\u5F53\u524D\u95EE\u9898\u7684\u5019\u9009\u7B54\u6848\u4E2D`;
  if (values.includes("other") && (otherText === void 0 || otherText.trim() === "")) return "\u9009\u62E9\u201C\u5176\u4ED6\u201D\u65F6\u9700\u8981\u8865\u5145\u8BF4\u660E";
  return null;
}
function nextAfterAnswer(draft) {
  return questionFor(draft.originalIdea, draft.answers);
}
function addHistory(draft, action, questionId, values, otherText) {
  draft.history = [
    ...draft.history,
    {
      revision: draft.revision,
      action,
      at: Date.now(),
      ...questionId === void 0 ? {} : { questionId },
      ...values === void 0 ? {} : { values },
      ...otherText === void 0 ? {} : { otherText }
    }
  ].slice(-100);
}
function clearDownstreamAnswers(draft, questionId) {
  const order = ["target-platform", "core-user", "core-goal", "core-flow", "core-modules", "core-pages"];
  const index = order.indexOf(questionId);
  if (index < 0) return;
  for (const id of order.slice(index + 1)) delete draft.answers[id];
}
async function persistMutation(projects, root, draft, expectedRevision, key, response) {
  draft.revision = expectedRevision + 1;
  draft.lastRequestKey = key;
  response.revision = draft.revision;
  draft.lastResponse = response;
  const saved = await projects.save(root, draft, expectedRevision);
  if (!saved.ok) return errorResponse(saved.error.code, saved.error.message, saved.error.current);
  response.revision = saved.value.revision;
  response.projectName = saved.value.projectName;
  response.projectFile = projects.fileName(saved.value.projectId);
  return response;
}
async function loadSession(projects, root, sessionId) {
  if (sessionId === void 0 || sessionId.trim() === "") return null;
  const result = await projects.read(root, sessionId);
  return result.ok ? result.value : null;
}
function initialDraft(idea, projectName, styleNote, projectId) {
  const answers = explicitAnswersFromIdea(idea);
  return {
    flowVersion: CREATE_FLOW_VERSION,
    projectId,
    projectName,
    originalIdea: idea.trim(),
    status: "draft",
    revision: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    boardName: null,
    deferredStyleNote: styleNote,
    answers,
    currentQuestion: null,
    discovery: initialDiscovery(idea, answers),
    briefMarkdown: null,
    pendingInterpretation: null,
    brief: null,
    history: [{ revision: 1, action: "start", at: Date.now() }]
  };
}
function migrateLegacyDraft(draft) {
  const discovery = initialDiscovery(draft.originalIdea, draft.answers);
  const legacyDimensionByQuestion = {
    "target-platform": "target-platform",
    "core-user": "target-user",
    "core-goal": "core-outcome",
    "core-flow": "core-loop",
    "core-modules": "product-architecture",
    "core-pages": "product-architecture"
  };
  const legacyLabelByQuestion = {
    "target-platform": "\u4EA7\u54C1\u7AEF",
    "core-user": "\u6838\u5FC3\u7528\u6237",
    "core-goal": "\u6838\u5FC3\u7ED3\u679C",
    "core-flow": "\u6838\u5FC3\u6D41\u7A0B",
    "core-modules": "\u4EA7\u54C1\u7ED3\u6784",
    "core-pages": "\u9875\u9762\u7ED3\u6784"
  };
  discovery.resolvedDecisions = Object.entries(draft.answers).map(([questionId, answer]) => {
    const legacyQuestion = questionById(draft.originalIdea, questionId);
    const semanticValues = answer.values.map((value2) => legacyQuestion?.options.find((option) => option.id === value2)?.label ?? value2);
    const value = answer.normalizedText ?? answer.otherText ?? semanticValues.join("\u3001");
    return `${legacyLabelByQuestion[questionId] ?? questionId}\uFF1A${value}`;
  });
  const resolvedDimensions = new Set(Object.keys(draft.answers).map((questionId) => legacyDimensionByQuestion[questionId]).filter(Boolean));
  discovery.openDimensions = discovery.openDimensions.filter((dimension) => !resolvedDimensions.has(dimension));
  draft.flowVersion = CREATE_FLOW_VERSION;
  draft.currentQuestion = null;
  draft.pendingInterpretation = null;
  draft.discovery = refreshDiscovery(discovery);
  draft.briefMarkdown = null;
  addHistory(draft, "migrate-create-v2");
}
function draw2codeCreateTool(projects, scenes) {
  return defineTool({
    name: "draw2code_create",
    description: "Create a new \u753B\u7801 project through adaptive product discovery and one executable prototype brief. This is the mandatory entry point when the user says they want to create, build, or design a new product from scratch. Call action=start as soon as a new-project intent is clear; pass the user's idea faithfully, infer a concise semantic projectName from the entire idea, and never call draw2code_update first. Explicit facts returned in discovery must not be asked again. A discovery result means the Agent must choose the single highest-impact unresolved product decision. If information is insufficient, call action=propose_question with a product-specific insight, one decision question, 2\u20134 tradeoff-rich options, a recommendation, decisionImpact and dependencies. To make the native card lossless, question.text itself must be \u201C\u5224\u65AD\uFF1A{insight}\\n\\n\u95EE\u9898\uFF1A{self-contained insight + decision question}\u201D; the text after \u201C\u95EE\u9898\uFF1A\u201D must repeat the product judgment so it remains meaningful even if an Agent extracts only that part. question.options must already include synthesize-now/\u76F4\u63A5\u6574\u7406\u9879\u76EE\u7B80\u62A5, unknown/\u8FD8\u6CA1\u60F3\u597D and other/\u5176\u4ED6 in addition to the product directions. question.dimension must use one returned openDimensions ID exactly: trigger-context, existing-alternative, core-outcome, unique-mechanism, core-loop, critical-risk, scope-proof, target-user, target-platform, or product-architecture. Never invent shorter aliases such as mechanism or risk. Never use the old fixed platform/user/goal/flow/modules/pages sequence, and never ask modules and pages as separate checklist questions. After every question result, call the host ask_user_question interaction with exactly one question and every returned choice, including \u201C\u76F4\u63A5\u6574\u7406\u9879\u76EE\u7B80\u62A5\u201D, \u201C\u8FD8\u6CA1\u60F3\u597D\u201D and \u201C\u5176\u4ED6\u201D; never truncate or silently replace options. Map the selected label back to its option id and call action=answer. The synthesize-now choice returns discovery.nextAction=synthesize. When the core scenario, outcome, unique mechanism, first-version flow and scope are clear\u2014or the user asks to stop\u2014call action=synthesize with stopReason and a complete PrototypeBrief. Discovery may stop early and must stop after ten questions. The tool validates PrototypeBrief, derives pageBlueprints/pageMockData, and deterministically renders briefMarkdown. When status=ready, show the complete briefMarkdown verbatim, then show one explicit page-range confirmation card listing every page: \u201C\u786E\u8BA4\u8FD9\u4E9B\u9875\u9762\u5E76\u7ED8\u5236 / \u8C03\u6574\u9875\u9762\u8303\u56F4 / \u8C03\u6574\u4EA7\u54C1\u65B9\u5411\u201D; do not summarize it. Use action=answer for a choice, action=skip when the user skips the pending question, action=revise to change an earlier answer and invalidate only dependent questions, action=rename to edit the project name, action=resume to reopen a draft, action=list to show unfinished projects, and action=confirm only after the user confirms the ready brief. The tool stores product intent separately from scene files. It creates an isolated empty board only after confirmation and returns nextAction=draw2code_update plus a machine-readable drawingPlan. For three or more pages, drawingPlan allows only the representative page first; the model must not generate the remaining page ops until action=review returns nextActionCode=write_remaining_pages. The model must call draw2code_update with the returned boardName and drawingPlan. projectName is required for action=start, should usually be 4\u201312 Chinese characters, and becomes the board name directly; never append \u201C\u539F\u578B\u201D or another workflow suffix. The tool validates this Agent-authored name but does not derive it from the raw idea. The prototype is semantic low-fi: do not ask for brand colors, fonts, 3D/2D, flat/skeuomorphic style here, but restrained semantic tones for categories, states, and primary actions are encouraged. If the user volunteers a style preference, pass it as styleNote so it is deferred to draw2code_generate. Options are structured for native choice cards when available; otherwise render them as numbered choices. \u201C\u76F4\u63A5\u6574\u7406\u9879\u76EE\u7B80\u62A5\u201D ends discovery without requiring a hidden chat input; \u201COther\u201D requires text and is stored directly; silence or \u201C\u8FD8\u6CA1\u60F3\u597D\u201D is an explicit pending decision, not pause or cancellation.",
    parameters: {
      root: { type: "string", required: true, description: "Workspace root (the session working directory)." },
      action: {
        type: "string",
        required: true,
        enum: [...CREATE_ACTIONS],
        description: "State-machine action for draw2code_create."
      },
      idea: { type: "string", description: "The user\u2019s new-project idea. Required for action=start." },
      projectName: { type: "string", description: "Agent-inferred semantic product name. Required for action=start; usually 4\u201312 Chinese characters, never copied or clipped from the raw idea, and without an \u201C\u539F\u578B\u201D suffix. Also used as the replacement name for action=rename." },
      styleNote: { type: "string", description: "A style preference volunteered by the user; record for generate, never apply to the prototype." },
      sessionId: { type: "string", description: "Project session ID returned by a prior call." },
      revision: { type: "integer", description: "Expected draft revision for mutation actions." },
      questionId: { type: "string", description: "Question being answered or revised." },
      values: { type: "array", items: { type: "string" }, description: "Selected option IDs. Use one value for single-select questions." },
      otherText: { type: "string", description: "Free-text answer when the user selected \u201Cother\u201D." },
      question: { type: "json", description: "Adaptive product question for action=propose_question. text must be directly displayable as \u201C\u5224\u65AD\uFF1A{insight}\\n\\n\u95EE\u9898\uFF1A{self-contained insight + decision question}\u201D; repeat the product judgment after \u95EE\u9898\uFF1A so the native card remains meaningful even if only that part is used. options must explicitly contain 2\u20134 product directions plus synthesize-now/\u76F4\u63A5\u6574\u7406\u9879\u76EE\u7B80\u62A5, unknown/\u8FD8\u6CA1\u60F3\u597D, and other/\u5176\u4ED6. DSH may serialize this JSON object as a string; both forms are accepted." },
      brief: { type: "json", description: "Structured PrototypeBrief for action=synthesize. Exact top-level keys: title, productDefinition, target, coreScenario, coreOutcome, uniqueMechanism[], firstVersionFlow[], includedScope[], excludedScope[], prototypeLayout, pages[], pageRelations[], prototypePrinciples[], acceptanceCriteria[], assumptions[], pendingDecisions[]. prototypeLayout requires platform, viewport{width,height}, arrangement, connectionStyle, representativePageId, comprehensionGoal. Each page requires id, name, goal, size{width,height}, structure:string[], primaryAction, secondaryActions:string[], mockDataGroups:[{name,items:string[]}], states:string[], navigation:string[], annotations:string[], acceptanceCriteria:string[]. Each relation requires fromPageId, toPageId, trigger, result, arrowStyle (solid|dashed), label. Never use mockData or other aliases. DSH may serialize this JSON object as a string; both forms are accepted." },
      stopReason: { type: "string", description: "Why discovery is ready to synthesize early." }
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          status: { type: "string", required: true },
          flowVersion: { type: "integer" },
          sessionId: { type: "string" },
          projectId: { type: "string" },
          projectName: { type: "string" },
          projectFile: { type: "string" },
          revision: { type: "integer" },
          question: { type: "json" },
          discovery: { type: "json" },
          brief: { type: "json" },
          briefMarkdown: { type: "string" },
          briefContract: { type: "json" },
          confirmation: { type: "json" },
          assumptions: { type: "json" },
          nameProposal: { type: "json" },
          boardName: { type: "string" },
          activeBoard: { type: "string" },
          nextAction: { type: "string" },
          drawingPlan: { type: "json" },
          error: { type: "json" },
          current: { type: "json" },
          drafts: { type: "json" },
          idempotent: { type: "boolean" }
        }
      },
      render: (_args, value) => {
        if (value.status === "discovery" && value.discovery !== void 0) {
          const discovery = value.discovery;
          if (discovery.nextAction === "synthesize") {
            return text(`${continuation(value)} status=discovery nextAction=synthesize
\u7528\u6237\u5DF2\u9009\u62E9\u76F4\u63A5\u6574\u7406\u6216\u95EE\u9898\u9884\u7B97\u5DF2\u7ECF\u7528\u5B8C\u3002\u5FC5\u987B\u7ACB\u5373\u8C03\u7528 action=synthesize\uFF0C\u5E76\u4E25\u683C\u6309 briefContract \u63D0\u4EA4 stopReason \u4E0E\u5B8C\u6574 PrototypeBrief\uFF1B\u9875\u9762\u771F\u5B9E\u6570\u636E\u5B57\u6BB5\u5FC5\u987B\u53EB mockDataGroups\uFF0C\u683C\u5F0F\u4E3A [{ name, items: string[] }]\uFF1B\u9875\u9762\u5173\u7CFB\u5B57\u6BB5\u5FC5\u987B\u53EB fromPageId/toPageId/trigger/result/arrowStyle/label\u3002\u7981\u6B62\u731C\u522B\u540D\u3001\u8BFB\u53D6\u63D2\u4EF6\u6E90\u7801\u6216\u7EE7\u7EED\u8C03\u7528 action=propose_question\u3002`);
          }
          return text(`${continuation(value)} status=discovery allowedDimensions=${discovery.openDimensions.join(",")} recommendedDimensions=${discovery.recommendedDimensions.join(",")}
\u8BF7\u6839\u636E discovery \u4E2D\u5DF2\u660E\u786E\u4E8B\u5B9E\u3001\u5386\u53F2\u56DE\u7B54\u548C\u5269\u4F59\u95EE\u9898\u9884\u7B97\uFF0C\u5224\u65AD\u4E0B\u4E00\u9879\u6700\u503C\u5F97\u89E3\u51B3\u7684\u4EA7\u54C1\u51B3\u7B56\u3002\u7B2C\u4E00\u9898\u4F18\u5148\u4ECE recommendedDimensions \u524D\u4E24\u9879\u4E2D\u9009\u62E9\uFF0C\u4E0D\u80FD\u5148\u95EE\u6A21\u5757\u3001\u9875\u9762\u6216\u901A\u7528\u4FE1\u606F\u67B6\u6784\u3002\u4FE1\u606F\u4E0D\u8DB3\u65F6\u8C03\u7528 action=propose_question\uFF1Bquestion \u5FC5\u987B\u5305\u542B id\u3001dimension\u3001insight\u3001text\u3001decisionImpact\u3001recommendedOptionId\u3001dependsOn \u548C 2\u20134 \u4E2A\u5E26 description \u7684 options\uFF0C\u5E76\u4E14 dimension \u5FC5\u987B\u9010\u5B57\u4F7F\u7528 allowedDimensions \u4E2D\u7684\u7A33\u5B9A ID\u3002\u4FE1\u606F\u5DF2\u7ECF\u8DB3\u591F\u6216\u7528\u6237\u8981\u6C42\u76F4\u63A5\u6574\u7406\u65F6\u8C03\u7528 action=synthesize\u3002`);
        }
        if (value.status === "question" && value.question !== void 0) {
          const question = value.question;
          const options = question.options.map((option, index) => `${index + 1}. ${option.id} \u2014 ${option.label}${option.description === void 0 ? "" : `\uFF1A${option.description}`}`).join("\n");
          const recommended = question.options.find((option) => option.id === question.recommendedOptionId);
          const insight = question.insight === void 0 || question.text.startsWith("\u5224\u65AD\uFF1A") ? "" : `\u5224\u65AD\uFF1A${question.insight}
`;
          const recommendation = recommended === void 0 ? "" : `
\u63A8\u8350\uFF1A${recommended.label} \u2014 ${recommended.description ?? ""}`;
          const impact = question.decisionImpact === void 0 ? "" : `
\u51B3\u7B56\u5F71\u54CD\uFF1A${question.decisionImpact}`;
          return text(`${continuation(value)} status=question questionId=${question.id}
${insight}${question.text}
${options}${recommendation}${impact}${question.allowOther ? "\n\uFF08\u53EF\u9009\u201C\u5176\u4ED6\u201D\u5E76\u8865\u5145\u8BF4\u660E\uFF09" : ""}
\u8C03\u7528 ask_user_question \u65F6\u5FC5\u987B\u539F\u6837\u590D\u5236 question.askUserQuestionArgs\uFF0C\u4E0D\u80FD\u4E22\u6389\u5224\u65AD\u3001\u9009\u9879\u6216\u201C\u76F4\u63A5\u6574\u7406\u9879\u76EE\u7B80\u62A5\u201D\u3002\u4E0B\u4E00\u6B21\u8C03\u7528\u5FC5\u987B\u4F7F\u7528 action=answer\u3001\u4E0A\u9762\u7684 sessionId/revision/questionId\uFF0C\u5E76\u628A\u7528\u6237\u9009\u62E9\u7684 option id \u653E\u5165 values\u3002`);
        }
        if (value.status === "ready") {
          const markdown = value.briefMarkdown ?? "\u9879\u76EE\u7B80\u62A5\u7F3A\u5C11\u53EF\u8BFB Markdown\uFF0C\u8BF7\u4FEE\u590D\u540E\u518D\u786E\u8BA4\u3002";
          return text(`${continuation(value)} status=ready
${markdown}

\u8BF7\u5B8C\u6574\u5C55\u793A\u4EE5\u4E0A\u9879\u76EE\u7B80\u62A5\uFF0C\u4E0D\u8981\u81EA\u884C\u7F29\u5199\u6216\u91CD\u65B0\u603B\u7ED3\u3002\u968F\u540E\u4F7F\u7528\u5BBF\u4E3B ask_user_question \u539F\u6837\u590D\u5236 confirmation.askUserQuestionArgs\uFF1B\u8FD9\u5F20\u5361\u4F1A\u660E\u786E\u5217\u51FA\u5C06\u7ED8\u5236\u7684\u9875\u9762\uFF0C\u5E76\u4E14\u4EC5\u5305\u542B\u201C\u786E\u8BA4\u8FD9\u4E9B\u9875\u9762\u5E76\u7ED8\u5236 / \u8C03\u6574\u9875\u9762\u8303\u56F4 / \u8C03\u6574\u4EA7\u54C1\u65B9\u5411\u201D\u3002\u786E\u8BA4\u540E\u8C03\u7528 action=confirm\u3002\u9009\u62E9\u8C03\u6574\u65F6\u76F4\u63A5\u8C03\u7528 action=propose_question\uFF0C\u53EA\u8FFD\u95EE\u53D7\u5F71\u54CD\u7684\u4E00\u9879\uFF1B\u65E7\u7B80\u62A5\u4F1A\u5931\u6548\uFF0C\u56DE\u7B54\u540E\u5FC5\u987B\u91CD\u65B0 synthesize \u5B8C\u6574\u7B80\u62A5\u3002`);
        }
        if (value.status === "confirmed") {
          const drawingPlan = value.drawingPlan;
          return text(`${continuation(value)} status=confirmed boardName=${value.boardName ?? ""} activeBoard=${value.activeBoard ?? ""} nextAction=${value.nextAction ?? "draw2code_update"} drawingNextAction=${drawingPlan?.nextActionCode ?? "write_pages"} allowedPageIds=${(drawingPlan?.allowedPageIds ?? []).join(",")} remainingPageIds=${(drawingPlan?.remainingPageIds ?? []).join(",")}
\u9879\u76EE\u300C${value.projectName ?? ""}\u300D\u5DF2\u786E\u8BA4\uFF0C\u72EC\u7ACB\u753B\u677F\u5DF2\u521B\u5EFA\u3002\u5FC5\u987B\u4E25\u683C\u6267\u884C drawingPlan\uFF1A\u5F53 drawingNextAction=write_representative \u65F6\uFF0C\u672C\u8F6E\u53EA\u4E3A allowedPageIds \u751F\u6210 ops\uFF1B\u5199\u5165\u540E\u7B49\u5F85\u753B\u5E03\u53EF\u89C1\uFF0C\u518D\u7528 draw2code_update action=review \u548C\u8FD4\u56DE\u7684 reviewToken \u8BB0\u5F55 representative \u590D\u6838\uFF0C\u968F\u540E\u624D\u751F\u6210 remainingPageIds\u3002\u4E0D\u8981\u9884\u5148\u751F\u6210\u5168\u90E8\u9875\u9762\u7684\u5927\u6279 ops\u3002\u6700\u7EC8\u7528 action=review phase=final \u6536\u53E3\uFF0C\u53EA\u6709 completionReady=true \u624D\u80FD\u62A5\u544A\u5B8C\u6210\u3002\u6BCF\u4E2A\u91CD\u590D\u5185\u5BB9\u7EC4\u4EF6\u81F3\u5C11\u63D0\u4F9B 3 \u6761\u53EF\u89C1 mock \u6570\u636E\uFF0C\u4E0D\u8981\u56DE\u5199\u65E7\u753B\u677F\u3002`);
        }
        if (value.status === "drafts") {
          const drafts = value.drafts ?? [];
          const summary = drafts.map((draft) => `${draft.sessionId ?? ""} ${draft.projectName ?? ""} (${draft.status ?? ""})`).join("\n");
          return text(`\u627E\u5230 ${drafts.length} \u4E2A\u672A\u5B8C\u6210\u9879\u76EE\uFF0C\u8BF7\u8BA9\u7528\u6237\u9009\u62E9\u8981\u7EE7\u7EED\u7684\u9879\u76EE\u6216\u521B\u5EFA\u65B0\u9879\u76EE\u3002
${summary}`);
        }
        if (value.status === "error") {
          const current = value.current;
          return text(`draw2code_create \u53EF\u6062\u590D\u9519\u8BEF\uFF1A${value.error?.message ?? "unknown error"}${current === void 0 ? "" : `
\u8BF7\u4F7F\u7528 current.sessionId=${current.sessionId ?? ""}\u3001current.revision=${current.revision ?? ""} \u4FEE\u6B63\u540E\u91CD\u8BD5\u3002`}`);
        }
        return text(`${continuation(value)} status=${value.status} project=${value.projectName ?? ""}`);
      }
    },
    async execute(args) {
      if (args.action === "start") {
        const idea = typeof args.idea === "string" ? args.idea.trim() : "";
        if (idea === "") return errorResponse("invalid_action", "action=start requires a non-empty idea");
        if (typeof args.projectName !== "string" || args.projectName.trim() === "") {
          return errorResponse("project_name_required", "\u8BF7\u5148\u57FA\u4E8E\u5B8C\u6574\u9700\u6C42\u8BED\u4E49\u6982\u62EC\u4E00\u4E2A\u7B80\u77ED\u4EA7\u54C1\u540D\uFF0C\u518D\u7528 projectName \u91CD\u65B0\u8C03\u7528 action=start\uFF1B\u4E0D\u8981\u590D\u5236\u6216\u622A\u53D6\u539F\u8BDD");
        }
        const projectName = normalizeProjectName(args.projectName);
        const nameError = projectNameValidationError(projectName, idea);
        if (nameError !== null) return errorResponse("project_name_invalid", nameError);
        const projectId = newProjectId();
        const draft2 = initialDraft(idea, projectName, args.styleNote?.trim() || null, projectId);
        const created = await projects.create(args.root, draft2);
        if (!created.ok) return errorResponse(created.error.code, created.error.message);
        return {
          ...responseFor(projects, created.value),
          nameProposal: {
            suggestedName: projectName,
            choices: [
              { id: "use", label: "\u4F7F\u7528\u8FD9\u4E2A\u540D\u79F0" },
              { id: "edit", label: "\u4FEE\u6539\u540D\u79F0" },
              { id: "later", label: "\u7A0D\u540E\u518D\u547D\u540D" }
            ]
          }
        };
      }
      if (args.action === "list") {
        const listed = await projects.list(args.root);
        if (!listed.ok) return errorResponse(listed.error.code, listed.error.message);
        return {
          status: "drafts",
          drafts: listed.value.filter((item) => item.status !== "archived" && item.status !== "abandoned").map((item) => ({
            sessionId: item.projectId,
            projectName: item.projectName,
            idea: item.originalIdea,
            status: item.status,
            revision: item.revision,
            updatedAt: item.updatedAt,
            boardName: item.boardName
          }))
        };
      }
      const sessionId = args.sessionId;
      const draft = await loadSession(projects, args.root, sessionId);
      if (draft === null) return errorResponse("session_not_found", "\u627E\u4E0D\u5230\u8FD9\u4E2A\u9879\u76EE\u8349\u7A3F\uFF0C\u8BF7\u9009\u62E9\u6062\u590D\u5DF2\u6709\u9879\u76EE\u6216\u91CD\u65B0\u5F00\u59CB");
      const key = requestKey(args);
      if (draft.lastRequestKey === key && draft.lastResponse !== void 0) {
        return { ...clone3(draft.lastResponse), idempotent: true };
      }
      if (draft.status !== "draft" && ["propose_question", "synthesize", "skip", "answer", "revise"].includes(args.action)) {
        return errorResponse("project_not_editable", `\u9879\u76EE\u5F53\u524D\u72B6\u6001\u4E3A ${draft.status}\uFF0C\u4E0D\u80FD\u7EE7\u7EED\u4FEE\u6539\u53D1\u73B0\u95EE\u9898\u6216\u9879\u76EE\u7B80\u62A5`, draft);
      }
      if (args.action === "resume") {
        if (draft.flowVersion === void 0 && draft.status === "draft" && draft.brief === null) {
          const expectedRevision = draft.revision;
          migrateLegacyDraft(draft);
          return persistMutation(projects, args.root, draft, expectedRevision, key, responseFor(projects, draft));
        }
        return responseFor(projects, draft);
      }
      if (args.action === "propose_question") {
        if (draft.flowVersion !== CREATE_FLOW_VERSION) return errorResponse("legacy_upgrade_required", "\u8BF7\u5148\u7528 action=resume \u5347\u7EA7\u65E7\u9879\u76EE\u8349\u7A3F", draft);
        if (typeof args.revision !== "number") return errorResponse("invalid_action", "action=propose_question requires revision", draft);
        if (draft.revision !== args.revision) return errorResponse("stale_revision", `project changed since revision ${args.revision}`, draft);
        if (draft.currentQuestion !== null) return errorResponse("question_pending", "\u8BF7\u5148\u56DE\u7B54\u5F53\u524D\u95EE\u9898\uFF0C\u518D\u63D0\u51FA\u4E0B\u4E00\u9898", draft);
        const discovery = draft.discovery;
        const isReadyAdjustment = draft.brief !== null;
        const validated = validateAdaptiveQuestion(normalizeStructuredArg(args.question), discovery, { allowAdjustment: isReadyAdjustment });
        if (!validated.ok) return errorResponse(validated.code, validated.message, draft);
        draft.brief = null;
        draft.briefMarkdown = null;
        draft.currentQuestion = validated.question;
        draft.discovery = refreshDiscovery({
          ...discovery,
          questions: [...discovery.questions, validated.question],
          adjustmentQuestionIds: isReadyAdjustment ? [.../* @__PURE__ */ new Set([...discovery.adjustmentQuestionIds ?? [], validated.question.id])] : discovery.adjustmentQuestionIds ?? [],
          stopReason: null
        });
        addHistory(draft, "propose-question", validated.question.id);
        return persistMutation(projects, args.root, draft, args.revision, key, responseFor(projects, draft));
      }
      if (args.action === "synthesize") {
        if (draft.flowVersion !== CREATE_FLOW_VERSION) return errorResponse("legacy_upgrade_required", "\u8BF7\u5148\u7528 action=resume \u5347\u7EA7\u65E7\u9879\u76EE\u8349\u7A3F", draft);
        if (typeof args.revision !== "number") return errorResponse("invalid_action", "action=synthesize requires revision", draft);
        if (draft.revision !== args.revision) return errorResponse("stale_revision", `project changed since revision ${args.revision}`, draft);
        if (typeof args.stopReason !== "string" || args.stopReason.trim() === "") return errorResponse("invalid_action", "action=synthesize requires stopReason", draft);
        let discovery = draft.discovery;
        if (draft.currentQuestion !== null) {
          const pending = draft.currentQuestion;
          const prefix = `${pending.id}\uFF1A`;
          draft.answers[pending.id] = { questionId: pending.id, values: ["unknown"], confirmed: true };
          discovery = refreshDiscovery({
            ...discovery,
            assumptions: [
              ...discovery.assumptions.filter((item) => !item.startsWith(prefix)),
              `${prefix}${pending.text}\uFF08\u7528\u6237\u9009\u62E9\u76F4\u63A5\u6574\u7406\uFF0C\u5F53\u524D\u95EE\u9898\u672A\u56DE\u7B54\uFF09`
            ]
          });
          addHistory(draft, "skip-for-synthesize", pending.id, ["unknown"]);
        }
        const normalizedBrief = normalizeStructuredArg(args.brief);
        const briefObject = typeof normalizedBrief === "object" && normalizedBrief !== null && !Array.isArray(normalizedBrief) ? clone3(normalizedBrief) : normalizedBrief;
        if (typeof briefObject === "object" && briefObject !== null && !Array.isArray(briefObject)) {
          const briefRecord = briefObject;
          const pending = Array.isArray(briefRecord.pendingDecisions) ? briefRecord.pendingDecisions.filter((item) => typeof item === "string") : [];
          briefRecord.pendingDecisions = [.../* @__PURE__ */ new Set([...pending, ...discovery.assumptions])];
        }
        const validated = validatePrototypeBrief(briefObject, draft.deferredStyleNote);
        if (!validated.ok) return errorResponse(validated.code, validated.message, draft);
        draft.discovery = {
          ...discovery,
          nextAction: "synthesize",
          stopReason: args.stopReason.trim()
        };
        draft.currentQuestion = null;
        draft.brief = validated.brief;
        draft.briefMarkdown = validated.markdown;
        addHistory(draft, "synthesize");
        return persistMutation(projects, args.root, draft, args.revision, key, responseFor(projects, draft));
      }
      if (args.action === "abandon" || args.action === "archive") {
        if (typeof args.revision !== "number") return errorResponse("invalid_action", `${args.action} requires revision`, draft);
        if (draft.revision !== args.revision) return errorResponse("stale_revision", `project changed since revision ${args.revision}`, draft);
        draft.status = args.action === "abandon" ? "abandoned" : "archived";
        draft.currentQuestion = null;
        addHistory(draft, args.action);
        const response = responseFor(projects, draft);
        return persistMutation(projects, args.root, draft, args.revision, key, response);
      }
      if (args.action === "rename") {
        if (typeof args.revision !== "number" || typeof args.projectName !== "string" || args.projectName.trim() === "") {
          return errorResponse("invalid_action", "action=rename requires projectName and revision", draft);
        }
        if (draft.revision !== args.revision) return errorResponse("stale_revision", `project changed since revision ${args.revision}`, draft);
        const projectName = normalizeProjectName(args.projectName);
        const nameError = projectNameValidationError(projectName);
        if (nameError !== null) return errorResponse("project_name_invalid", nameError, draft);
        draft.projectName = projectName;
        addHistory(draft, "rename");
        const response = responseFor(projects, draft, {
          nameProposal: { suggestedName: draft.projectName, choices: [{ id: "use", label: "\u4F7F\u7528\u8FD9\u4E2A\u540D\u79F0" }] }
        });
        return persistMutation(projects, args.root, draft, args.revision, key, response);
      }
      if (args.action === "skip") {
        if (typeof args.revision !== "number" || typeof args.questionId !== "string") {
          return errorResponse("invalid_action", "action=skip requires revision and questionId", draft);
        }
        if (draft.revision !== args.revision) return errorResponse("stale_revision", `project changed since revision ${args.revision}`, draft);
        if (draft.flowVersion !== CREATE_FLOW_VERSION || draft.currentQuestion === null) return errorResponse("question_not_pending", "\u5F53\u524D\u6CA1\u6709\u53EF\u4EE5\u8DF3\u8FC7\u7684\u95EE\u9898", draft);
        const question2 = draft.currentQuestion;
        if (question2.id !== args.questionId) return errorResponse("invalid_question", `question "${args.questionId}" is not pending`, draft);
        const discovery = draft.discovery;
        const prefix = `${question2.id}\uFF1A`;
        draft.answers[question2.id] = { questionId: question2.id, values: ["unknown"], confirmed: true };
        draft.discovery = refreshDiscovery({
          ...discovery,
          assumptions: [
            ...discovery.assumptions.filter((item) => !item.startsWith(prefix)),
            `${prefix}${question2.text}\uFF08\u7528\u6237\u8DF3\u8FC7\uFF0C\u4FDD\u7559\u4E3A\u5F85\u9A8C\u8BC1\u5047\u8BBE\uFF09`
          ],
          openDimensions: question2.dimension === void 0 ? discovery.openDimensions : [.../* @__PURE__ */ new Set([...discovery.openDimensions, question2.dimension])]
        });
        draft.currentQuestion = null;
        draft.brief = null;
        draft.briefMarkdown = null;
        addHistory(draft, "skip", question2.id, ["unknown"]);
        return persistMutation(projects, args.root, draft, args.revision, key, responseFor(projects, draft));
      }
      if (args.action === "confirm") {
        if (typeof args.revision !== "number") return errorResponse("invalid_action", "action=confirm requires revision", draft);
        if (draft.revision !== args.revision) return errorResponse("stale_revision", `project changed since revision ${args.revision}`, draft);
        if (draftStatus(draft) !== "ready") return errorResponse("not_ready", "\u9879\u76EE\u7B80\u62A5\u8FD8\u6CA1\u6709\u5B8C\u6210\uFF0C\u4E0D\u80FD\u786E\u8BA4\u7ED8\u5236", draft);
        const boards = await scenes.list(args.root);
        if (!boards.ok) return errorResponse(boards.error.code, boards.error.message, draft);
        const boardName = boardNameFromProject(draft.projectName, new Set(boards.value.map((board) => board.name)));
        const created = await scenes.create(args.root, boardName);
        if (!created.ok) return errorResponse(created.error.code, created.error.message, draft);
        const active = await scenes.setActiveBoard(args.root, boardName);
        if (!active.ok) {
          await scenes.remove(args.root, boardName);
          return errorResponse(active.error.code, active.error.message, draft);
        }
        draft.status = "confirmed";
        draft.boardName = boardName;
        if (draft.flowVersion !== CREATE_FLOW_VERSION) {
          draft.brief = buildBrief(draft.originalIdea, draft.answers, draft.deferredStyleNote);
        }
        addHistory(draft, "confirm");
        const response = responseFor(projects, draft, { activeBoard: active.value.name, nextAction: "draw2code_update" });
        const saved = await persistMutation(projects, args.root, draft, args.revision, key, response);
        if (saved.status === "error") await scenes.remove(args.root, boardName);
        return saved;
      }
      if (args.action !== "answer" && args.action !== "revise") return errorResponse("invalid_action", `unsupported action ${args.action}`, draft);
      if (typeof args.revision !== "number" || typeof args.questionId !== "string" || !Array.isArray(args.values)) {
        return errorResponse("invalid_action", `${args.action} requires revision, questionId and values`, draft);
      }
      if (draft.revision !== args.revision) return errorResponse("stale_revision", `project changed since revision ${args.revision}`, draft);
      if (args.action === "answer" && (draft.currentQuestion === null || draft.currentQuestion.id !== args.questionId)) {
        return errorResponse("historical_answer_requires_revise", "action=answer \u53EA\u80FD\u56DE\u7B54\u5F53\u524D\u95EE\u9898\uFF1B\u4FEE\u6539\u5386\u53F2\u7B54\u6848\u5FC5\u987B\u4F7F\u7528 action=revise", draft);
      }
      const question = questionFromDraft(draft, args.questionId);
      if (question === null) return errorResponse("invalid_question", `question "${args.questionId}" is not valid for this project`, draft);
      const validation = validateValues(question, args.values, args.otherText);
      if (validation !== null) return errorResponse("invalid_option", validation, draft);
      if (draft.flowVersion === CREATE_FLOW_VERSION && question.kind === "choice") {
        if (args.values.includes("synthesize-now")) {
          const discovery2 = draft.discovery;
          const prefix = `${question.id}\uFF1A`;
          draft.answers[question.id] = { questionId: question.id, values: ["unknown"], confirmed: true };
          draft.discovery = {
            ...refreshDiscovery({
              ...discovery2,
              assumptions: [
                ...discovery2.assumptions.filter((item) => !item.startsWith(prefix)),
                `${prefix}${question.text}\uFF08\u7528\u6237\u9009\u62E9\u76F4\u63A5\u6574\u7406\uFF0C\u4FDD\u7559\u4E3A\u5F85\u9A8C\u8BC1\u5047\u8BBE\uFF09`
              ],
              openDimensions: question.dimension === void 0 ? discovery2.openDimensions : [.../* @__PURE__ */ new Set([...discovery2.openDimensions, question.dimension])]
            }),
            nextAction: "synthesize",
            stopReason: "\u7528\u6237\u9009\u62E9\u76F4\u63A5\u6574\u7406\u9879\u76EE\u7B80\u62A5"
          };
          draft.currentQuestion = null;
          draft.brief = null;
          draft.briefMarkdown = null;
          addHistory(draft, "synthesize-now", question.id, args.values);
          return persistMutation(projects, args.root, draft, args.revision, key, responseFor(projects, draft));
        }
        const selected = question.options.find((option) => option.id === args.values[0]);
        const answerText = args.values.includes("other") ? args.otherText?.trim() ?? "" : selected?.label ?? args.values[0];
        draft.answers[question.id] = {
          questionId: question.id,
          values: args.values,
          ...args.values.includes("other") ? { otherText: args.otherText?.trim() ?? "" } : {},
          confirmed: true
        };
        let discovery = draft.discovery;
        if (args.action === "revise") {
          const invalidated = removeDependentQuestions(discovery, question.id);
          discovery = invalidated.discovery;
          for (const id of invalidated.removedIds) delete draft.answers[id];
        }
        const decisionPrefix = `${question.id}\uFF1A`;
        const resolvedDecisions = discovery.resolvedDecisions.filter((item) => !item.startsWith(decisionPrefix));
        const assumptions = discovery.assumptions.filter((item) => !item.startsWith(decisionPrefix));
        const openDimensions = question.dimension === void 0 ? discovery.openDimensions : args.values.includes("unknown") ? [.../* @__PURE__ */ new Set([...discovery.openDimensions, question.dimension])] : discovery.openDimensions.filter((dimension) => dimension !== question.dimension);
        if (args.values.includes("unknown")) assumptions.push(`${decisionPrefix}${question.text}\uFF08\u7528\u6237\u6682\u672A\u51B3\u5B9A\uFF09`);
        else resolvedDecisions.push(`${decisionPrefix}${answerText}`);
        draft.discovery = refreshDiscovery({ ...discovery, resolvedDecisions, assumptions, openDimensions });
        draft.currentQuestion = null;
        draft.brief = null;
        draft.briefMarkdown = null;
        addHistory(draft, args.action, question.id, args.values, args.otherText);
        return persistMutation(projects, args.root, draft, args.revision, key, responseFor(projects, draft));
      }
      if (question.kind === "interpretation") {
        const pending = draft.pendingInterpretation;
        if (pending === null) return errorResponse("invalid_state", "no free-text interpretation is waiting for confirmation", draft);
        const choice = args.values[0];
        if (choice === "edit") {
          draft.pendingInterpretation = null;
          draft.currentQuestion = pending.question;
          addHistory(draft, "interpretation-edit", pending.questionId);
          return persistMutation(projects, args.root, draft, args.revision, key, responseFor(projects, draft));
        }
        const answer = {
          questionId: pending.questionId,
          values: pending.values,
          otherText: pending.otherText,
          ...choice === "confirm" ? { normalizedText: pending.normalizedText } : {},
          confirmed: choice === "confirm"
        };
        draft.answers[pending.questionId] = answer;
        draft.pendingInterpretation = null;
        draft.currentQuestion = nextAfterAnswer(draft);
        draft.status = draft.currentQuestion === null ? "ready" : "draft";
        draft.brief = draft.currentQuestion === null ? buildBrief(draft.originalIdea, draft.answers, draft.deferredStyleNote) : null;
        addHistory(draft, `interpretation-${choice}`, pending.questionId, pending.values, pending.otherText);
        return persistMutation(projects, args.root, draft, args.revision, key, responseFor(projects, draft));
      }
      if (args.action === "revise") clearDownstreamAnswers(draft, args.questionId);
      if (args.values.includes("other")) {
        const normalizedText = interpretOther(question, args.otherText ?? "");
        draft.answers[question.id] = {
          questionId: question.id,
          values: args.values,
          otherText: args.otherText?.trim() ?? "",
          normalizedText,
          confirmed: true
        };
        draft.pendingInterpretation = null;
        draft.currentQuestion = nextAfterAnswer(draft);
        draft.status = draft.currentQuestion === null ? "ready" : "draft";
        draft.brief = draft.currentQuestion === null ? buildBrief(draft.originalIdea, draft.answers, draft.deferredStyleNote) : null;
        addHistory(draft, "answer-other", question.id, args.values, args.otherText);
        return persistMutation(projects, args.root, draft, args.revision, key, responseFor(projects, draft));
      }
      draft.answers[question.id] = {
        questionId: question.id,
        values: args.values,
        confirmed: true
      };
      draft.currentQuestion = nextAfterAnswer(draft);
      draft.status = draft.currentQuestion === null ? "ready" : "draft";
      draft.brief = draft.currentQuestion === null ? buildBrief(draft.originalIdea, draft.answers, draft.deferredStyleNote) : null;
      addHistory(draft, args.action, question.id, args.values);
      return persistMutation(projects, args.root, draft, args.revision, key, responseFor(projects, draft));
    }
  });
}

// src/tools.ts
import { createHash, randomUUID as randomUUID2 } from "node:crypto";
import { open, realpath as realpath3 } from "node:fs/promises";
import { isAbsolute, relative, resolve as resolve2 } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";

// src/prototype-page.ts
function str(value) {
  return typeof value === "string" ? value : "";
}
function num(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
function customData(element) {
  return typeof element?.customData === "object" && element.customData !== null ? element.customData : {};
}
function role2(element) {
  return str(customData(element).role).trim().toLowerCase();
}
function containsPoint(page, x, y, tolerance = 0) {
  return x >= page.bounds.x - tolerance && y >= page.bounds.y - tolerance && x <= page.bounds.x + page.bounds.width + tolerance && y <= page.bounds.y + page.bounds.height + tolerance;
}
function pageDistance(page, x, y) {
  const right = page.bounds.x + page.bounds.width;
  const bottom = page.bounds.y + page.bounds.height;
  const dx = x < page.bounds.x ? page.bounds.x - x : x > right ? x - right : 0;
  const dy = y < page.bounds.y ? page.bounds.y - y : y > bottom ? y - bottom : 0;
  return Math.hypot(dx, dy);
}
function isPrototypePageLabel(element) {
  return str(element.type) === "text" && role2(element) === "prototype-page-label";
}
function isPrototypePageShell(element) {
  return str(element.type) === "rectangle" && role2(element) === "prototype-page" && str(customData(element).pageName).trim() !== "";
}
function prototypePageName(element) {
  if (str(element.type) === "frame") return str(element.name).trim();
  return isPrototypePageShell(element) ? str(customData(element).pageName).trim() : "";
}
function prototypePages(elements) {
  const pages = [];
  const names = /* @__PURE__ */ new Set();
  for (const element of elements) {
    const type = str(element.type);
    const pageName = prototypePageName(element);
    if (pageName === "" || names.has(pageName)) continue;
    names.add(pageName);
    pages.push({
      id: str(element.id),
      name: pageName,
      kind: type === "frame" ? "legacy-frame" : "page-shell",
      bounds: {
        x: num(element.x),
        y: num(element.y),
        width: num(element.width),
        height: num(element.height)
      },
      element
    });
  }
  return pages;
}
function pageNameWarnings(elements) {
  const firstByName = /* @__PURE__ */ new Map();
  const warnings = [];
  for (const element of elements) {
    const name = prototypePageName(element);
    if (name === "") continue;
    const firstId = firstByName.get(name);
    if (firstId === void 0) {
      firstByName.set(name, str(element.id));
      continue;
    }
    warnings.push({
      code: "page-name-duplicate",
      id: str(element.id),
      message: `\u9875\u9762\u300C${name}\u300D\u540C\u65F6\u7528\u4E8E ${firstId} \u548C ${str(element.id)}\uFF0C\u65E0\u6CD5\u6309\u9875\u9762\u540D\u552F\u4E00\u9009\u62E9\uFF1B\u8BF7\u4E3A\u5176\u4E2D\u4E00\u4E2A\u9875\u9762\u8BBE\u7F6E\u4E0D\u540C\u540D\u79F0`
    });
  }
  return warnings;
}
function pageMembershipCandidates(element, pages) {
  const id = str(element.id);
  const ownPage = pages.find((page) => page.id === id);
  if (ownPage !== void 0) return [ownPage];
  if (isPrototypePageLabel(element)) {
    const page = pages.find((candidate) => candidate.id === str(customData(element).pageId));
    return page === void 0 ? [] : [page];
  }
  const explicitFrame = str(element.frameId);
  if (explicitFrame !== "") {
    const page = pages.find((candidate) => candidate.kind === "legacy-frame" && candidate.id === explicitFrame);
    if (page !== void 0) return [page];
  }
  const centerX = num(element.x) + num(element.width) / 2;
  const centerY = num(element.y) + num(element.height) / 2;
  return pages.filter((page) => containsPoint(page, centerX, centerY, 2));
}
function pageForElement(element, pages) {
  const candidates = pageMembershipCandidates(element, pages);
  return candidates.length === 1 ? candidates[0] : void 0;
}
function arrowEndpoint(arrow, atEnd) {
  const points = Array.isArray(arrow.points) ? arrow.points : [];
  const point = Array.isArray(atEnd ? points.at(-1) : points[0]) ? atEnd ? points.at(-1) : points[0] : atEnd ? [num(arrow.width), num(arrow.height)] : [0, 0];
  return { x: num(arrow.x) + num(point[0]), y: num(arrow.y) + num(point[1]) };
}
function endpointPage(arrow, bindingKey, pages, elementsById) {
  const binding = typeof arrow[bindingKey] === "object" && arrow[bindingKey] !== null ? arrow[bindingKey] : {};
  const target = elementsById.get(str(binding.elementId));
  if (target !== void 0) {
    return pageForElement(target, pages);
  }
  const endpoint = arrowEndpoint(arrow, bindingKey === "endBinding");
  const contained = pages.filter((page) => containsPoint(page, endpoint.x, endpoint.y, 2));
  if (contained.length === 1) return contained[0];
  if (contained.length > 1) return void 0;
  return pages.map((page) => ({ page, distance: pageDistance(page, endpoint.x, endpoint.y) })).filter(({ distance }) => distance <= 48).sort((left, right) => left.distance - right.distance)[0]?.page;
}
function internalPageForArrow(arrow, pages, elementsById) {
  const source = endpointPage(arrow, "startBinding", pages, elementsById);
  const target = endpointPage(arrow, "endBinding", pages, elementsById);
  return source !== void 0 && target?.id === source.id ? source : void 0;
}
function relationForArrow(arrow, pages, elementsById) {
  if (str(arrow.type) !== "arrow") return void 0;
  const source = endpointPage(arrow, "startBinding", pages, elementsById);
  const target = endpointPage(arrow, "endBinding", pages, elementsById);
  if (source === void 0 || target === void 0 || source.id === target.id) return void 0;
  const startBinding = typeof arrow.startBinding === "object" && arrow.startBinding !== null ? arrow.startBinding : {};
  const endBinding = typeof arrow.endBinding === "object" && arrow.endBinding !== null ? arrow.endBinding : {};
  const label = [...elementsById.values()].find((element) => {
    return str(element.type) === "text" && str(element.containerId) === str(arrow.id);
  });
  return {
    id: str(arrow.id),
    sourcePage: source.name,
    targetPage: target.name,
    ...str(startBinding.elementId) === "" ? {} : { sourceElementId: str(startBinding.elementId) },
    ...str(endBinding.elementId) === "" ? {} : { targetElementId: str(endBinding.elementId) },
    ...str(label?.text).trim() === "" ? {} : { label: str(label?.text).trim() }
  };
}
function prototypePageRelations(elements, pages = prototypePages(elements)) {
  const elementsById = new Map(elements.map((element) => [str(element.id), element]));
  return elements.filter((element) => str(element.type) === "arrow").flatMap((arrow) => {
    const relation = relationForArrow(arrow, pages, elementsById);
    return relation === void 0 ? [] : [relation];
  });
}
function pageElementIds(page, elements, pages = prototypePages(elements)) {
  const elementsById = new Map(elements.map((element) => [str(element.id), element]));
  const crossPageArrowIds = new Set(
    prototypePageRelations(elements, pages).map((relation) => relation.id)
  );
  return elements.flatMap((element) => {
    if (str(element.id) === page.id || isPrototypePageLabel(element)) return [];
    if (str(element.type) === "text" && crossPageArrowIds.has(str(element.containerId))) return [];
    if (str(element.type) === "arrow") {
      const relation = relationForArrow(element, pages, elementsById);
      if (relation !== void 0) return [];
      const internalPage = internalPageForArrow(element, pages, elementsById);
      if (internalPage !== void 0) return internalPage.id === page.id ? [str(element.id)] : [];
    }
    return pageForElement(element, pages)?.id === page.id ? [str(element.id)] : [];
  });
}
function pageMembershipWarnings(elements, pages = prototypePages(elements)) {
  return elements.flatMap((element) => {
    if (pages.some((page) => page.id === str(element.id)) || isPrototypePageLabel(element) || str(element.type) === "arrow") return [];
    const candidates = pageMembershipCandidates(element, pages);
    if (candidates.length <= 1) return [];
    return [{
      code: "page-membership-ambiguous",
      id: str(element.id),
      message: `${str(element.id)} \u540C\u65F6\u843D\u5728\u9875\u9762\u300C${candidates.map((page) => page.name).join("\u300D\u300C")}\u300D\u4E2D\uFF0C\u65E0\u6CD5\u552F\u4E00\u5224\u65AD\u9875\u9762\u5F52\u5C5E\uFF1B\u8BF7\u79FB\u52A8\u9875\u9762\u6216\u5143\u7D20\u4EE5\u6D88\u9664\u91CD\u53E0`
    }];
  });
}
function publicPrototypePages(elements, pages = prototypePages(elements)) {
  return pages.map((page) => ({
    id: page.id,
    name: page.name,
    kind: page.kind,
    bounds: page.bounds,
    elementIds: pageElementIds(page, elements, pages)
  }));
}

// src/layout.ts
var SHAPE_TYPES = /* @__PURE__ */ new Set(["rectangle", "diamond", "ellipse"]);
var BOTTOM_NAV_MAX_GAP = 96;
var DEFAULT_MOCK_DATA_MIN = 3;
var BOTTOM_NAVIGATION_ITEM_ROLES2 = /* @__PURE__ */ new Set(["bottom-navigation-item", "bottom-nav-item"]);
var PRIMARY_ACTION_ROLES = /* @__PURE__ */ new Set(["primary-action", "primary-button"]);
var INTERACTIVE_ROLES = /* @__PURE__ */ new Set([
  ...PRIMARY_ACTION_ROLES,
  "button",
  "secondary-action",
  "secondary-button",
  "danger-button",
  "destructive-button",
  "chip",
  "filter-chip",
  "choice-chip",
  "tab",
  "tab-item",
  "bottom-navigation-item",
  "bottom-nav-item"
]);
var CONTENT_WARNING_CODES = /* @__PURE__ */ new Set([
  "page-content-too-sparse",
  "page-content-too-dense",
  "above-fold-content-insufficient",
  "continuous-empty-space-too-large",
  "status-emphasis-missing",
  "primary-action-missing",
  "primary-action-ambiguous",
  "visual-hierarchy-flat"
]);
function str2(value) {
  return typeof value === "string" ? value : "";
}
function num2(value, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
function customData2(element) {
  return typeof element.customData === "object" && element.customData !== null ? element.customData : {};
}
function isFocused(element, focusIds) {
  if (focusIds === void 0) return true;
  const id = str2(element.id);
  const frameId = str2(element.frameId);
  const pageId = str2(customData2(element).pageId);
  return focusIds.has(id) || frameId !== "" && focusIds.has(frameId) || pageId !== "" && focusIds.has(pageId);
}
function glyphUnits(value) {
  let units = 0;
  for (const char of value) {
    units += /[\u2e80-\u9fff\uff00-\uffef]/u.test(char) ? 1 : char === " " ? 0.35 : 0.55;
  }
  return units;
}
function estimatedLineCount(element) {
  const text3 = str2(element.text);
  if (text3 === "") return 1;
  const width = Math.max(1, num2(element.width, 160));
  const fontSize = Math.max(8, num2(element.fontSize, 20));
  const charsPerLine = Math.max(1, Math.floor(width / (fontSize * 0.62)));
  return text3.split(/\r?\n/u).reduce((count, line) => {
    return count + Math.max(1, Math.ceil(glyphUnits(line) / charsPerLine));
  }, 0);
}
function pageFor(element, pages) {
  return pageForElement(element, pages);
}
function isBottomNavigation(element) {
  const role3 = str2(customData2(element).role).toLowerCase();
  if (role3 === "bottom-navigation" || role3 === "bottom-nav" || role3 === "tabbar") return true;
  return /底部导航|底部选项卡|tabbar|bottom[ -]?navigation/iu.test(str2(element.text));
}
function isBottomNavigationMember(element) {
  return isBottomNavigation(element) || BOTTOM_NAVIGATION_ITEM_ROLES2.has(str2(customData2(element).role).toLowerCase());
}
function isVisibleMockData(element) {
  if (str2(element.type) !== "text" || str2(customData2(element).role).toLowerCase() !== "mock-data") return false;
  const value = str2(element.text).trim();
  if (value.length < 2) return false;
  return !/^(?:lorem ipsum|用户[a-c1-3]?|好友[a-c1-3]?|昵称|标题|内容|消息|示例|item\s*\d*|\.\.\.|…+)$/iu.test(value);
}
function issue(code, element, message) {
  const id = str2(element.id);
  return { code, ...id !== "" ? { id } : {}, message };
}
function inspectPrototypeLayout(elements, options = {}) {
  const pages = prototypePages(elements);
  const pageIds = new Set(pages.map((page) => page.id));
  const elementById = new Map(elements.map((element) => [str2(element.id), element]));
  const bottomNavigationShells = elements.filter((element) => SHAPE_TYPES.has(str2(element.type)) && isBottomNavigation(element));
  const errors = [];
  const warnings = [
    ...pageNameWarnings(elements),
    ...pageMembershipWarnings(elements, pages)
  ];
  for (const element of elements) {
    const type = str2(element.type);
    if (pageIds.has(str2(element.id)) || !isFocused(element, options.focusIds)) continue;
    const text3 = str2(element.text);
    if (SHAPE_TYPES.has(type) && text3.trim() !== "") {
      errors.push(issue(
        "shape-text-not-visible",
        element,
        `${str2(element.id)} is a ${type} with text, but shape text is not a visible label in Excalidraw; add a separate text element and optionally set containerId to ${str2(element.id)}`
      ));
    }
    if (type === "text" && text3 !== "") {
      const containerId = str2(element.containerId);
      const container = containerId === "" ? void 0 : elementById.get(containerId);
      const boundToShape = container !== void 0 && SHAPE_TYPES.has(str2(container.type));
      const directlyFocused = options.focusIds === void 0 || options.focusIds.has(str2(element.id)) || container !== void 0 && options.focusIds.has(str2(container.id));
      const elementRole3 = str2(customData2(element).role).toLowerCase();
      const containerRole = str2(customData2(container ?? {}).role).toLowerCase();
      const componentRole = elementRole3 || containerRole;
      if (containerId !== "" && container === void 0 && directlyFocused) {
        errors.push(issue(
          "container-target-missing",
          element,
          `${str2(element.id)} points to missing container ${containerId}; add the target shape or clear containerId so the label remains visible`
        ));
      }
      if (boundToShape && directlyFocused && componentRole === "") {
        errors.push(issue(
          "component-role-missing",
          element,
          `${str2(element.id)} is bound to ${containerId} without a semantic customData.role; mark the component as button, primary-action, select, input, chip, card, or another explicit product role so draw2code_update can apply the correct text alignment`
        ));
      }
      const bottomNavigationShell = bottomNavigationShells.find((shell) => {
        return num2(element.x) >= num2(shell.x) - 2 && num2(element.y) >= num2(shell.y) - 2 && num2(element.x) + num2(element.width) <= num2(shell.x) + num2(shell.width) + 2 && num2(element.y) + num2(element.height) <= num2(shell.y) + num2(shell.height) + 2;
      });
      const navigationItemFocused = options.focusIds === void 0 || options.focusIds.has(str2(element.id)) || bottomNavigationShell !== void 0 && options.focusIds.has(str2(bottomNavigationShell.id));
      if (bottomNavigationShell !== void 0 && navigationItemFocused && !BOTTOM_NAVIGATION_ITEM_ROLES2.has(elementRole3)) {
        errors.push(issue(
          "bottom-navigation-item-role-missing",
          element,
          `${str2(element.id)} is inside bottom navigation ${str2(bottomNavigationShell.id)} without customData.role=bottom-navigation-item; add the item role so its label is centered within its navigation slot`
        ));
      }
      const lines = estimatedLineCount(element);
      const fontSize = Math.max(8, num2(element.fontSize, 20));
      const lineHeight = Math.max(1, num2(element.lineHeight, 1.25));
      const requiredHeight = Math.ceil(lines * fontSize * lineHeight + 8);
      const explicitHeight = typeof element.height === "number" && Number.isFinite(element.height);
      if (lines > 1 && explicitHeight && num2(element.height) + 2 < requiredHeight) {
        errors.push(issue(
          "text-height-overflow",
          element,
          `${str2(element.id)} text height ${Math.round(num2(element.height))} cannot contain approximately ${lines} lines; use height >= ${requiredHeight} or split the component into separate text elements`
        ));
      }
    }
    const page = pageFor(element, pages);
    if (page !== void 0 && !isPrototypePageLabel(element) && type !== "arrow" && type !== "line") {
      const x1 = num2(element.x);
      const y1 = num2(element.y);
      const x2 = x1 + num2(element.width);
      const y2 = y1 + num2(element.height);
      const fx = page.bounds.x;
      const fy = page.bounds.y;
      const right = fx + page.bounds.width;
      const bottom = fy + page.bounds.height;
      if (x1 < fx - 2 || y1 < fy - 2 || x2 > right + 2 || y2 > bottom + 2) {
        errors.push(issue(
          page.kind === "legacy-frame" ? "frame-overflow" : "page-overflow",
          element,
          `${str2(element.id)} extends outside page ${page.name || page.id}; keep the complete component inside its page boundary`
        ));
      }
    }
    if (isBottomNavigation(element)) {
      const navPage = pageFor(element, pages);
      if (navPage === void 0) {
        warnings.push(issue(
          "bottom-navigation-unpaged",
          element,
          `${str2(element.id)} is marked as bottom navigation but is not inside a prototype page`
        ));
      } else {
        const pageBottom = navPage.bounds.y + navPage.bounds.height;
        const navBottom = num2(element.y) + num2(element.height);
        const gap = pageBottom - navBottom;
        if (gap > BOTTOM_NAV_MAX_GAP) {
          errors.push(issue(
            "bottom-navigation-offset",
            element,
            `${str2(element.id)} is ${Math.round(gap)}px above the page bottom; place the bottom navigation in the bottom safe area (gap <= ${BOTTOM_NAV_MAX_GAP}px)`
          ));
        }
      }
      if (type === "text") {
        errors.push(issue(
          "bottom-navigation-needs-shell",
          element,
          `${str2(element.id)} is a text-only bottom navigation; add a rectangle shell plus separate text labels so the component has a visible boundary and stable geometry`
        ));
      }
    }
  }
  for (const shell of bottomNavigationShells) {
    const items = elements.filter((element) => {
      if (str2(element.type) !== "text" || !BOTTOM_NAVIGATION_ITEM_ROLES2.has(str2(customData2(element).role).toLowerCase())) return false;
      return num2(element.x) >= num2(shell.x) - 2 && num2(element.y) >= num2(shell.y) - 2 && num2(element.x) + num2(element.width) <= num2(shell.x) + num2(shell.width) + 2 && num2(element.y) + num2(element.height) <= num2(shell.y) + num2(shell.height) + 2;
    });
    const shellFocused = isFocused(shell, options.focusIds) || items.some((item) => isFocused(item, options.focusIds));
    if (!shellFocused) continue;
    if (items.length === 0) {
      errors.push(issue(
        "bottom-navigation-items-missing",
        shell,
        `${str2(shell.id)} has no visible bottom-navigation-item labels; add separate text items inside the navigation shell`
      ));
      continue;
    }
    for (let leftIndex = 0; leftIndex < items.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < items.length; rightIndex += 1) {
        const left = items[leftIndex];
        const right = items[rightIndex];
        const overlaps = num2(left.x) < num2(right.x) + num2(right.width) && num2(left.x) + num2(left.width) > num2(right.x) && num2(left.y) < num2(right.y) + num2(right.height) && num2(left.y) + num2(left.height) > num2(right.y);
        if (!overlaps) continue;
        errors.push(issue(
          "bottom-navigation-item-overlap",
          shell,
          `${str2(left.id)} overlaps ${str2(right.id)} inside ${str2(shell.id)}; give each navigation item its own non-overlapping slot`
        ));
      }
    }
  }
  for (const page of pages) {
    const pageElement = page.element;
    if (str2(customData2(pageElement).role).toLowerCase() !== "prototype-page" || !isFocused(pageElement, options.focusIds)) continue;
    const configuredMinimum = num2(customData2(pageElement).mockDataMin, DEFAULT_MOCK_DATA_MIN);
    const minimum = Math.max(1, Math.floor(configuredMinimum));
    const records = new Set(
      elements.filter((element) => pageFor(element, pages)?.id === page.id && isVisibleMockData(element)).map((element) => str2(element.text).trim())
    );
    if (records.size < minimum) {
      errors.push(issue(
        "mock-data-insufficient",
        pageElement,
        `${page.name || page.id} requires ${minimum} visible mock-data text records; found ${records.size}. Add realistic example names, values, statuses or messages instead of empty boxes and mark each text with customData.role=mock-data`
      ));
    }
  }
  return { errors, warnings };
}
function elementRole(element) {
  return str2(customData2(element).role).trim().toLowerCase();
}
function isPageContent(element, page) {
  const type = str2(element.type);
  if (str2(element.id) === page.id || isPrototypePageLabel(element)) return false;
  if (type === "arrow" || type === "line" || type === "freedraw") return false;
  return num2(element.width) > 0 && num2(element.height) > 0;
}
function qualityIssue(code, page, message) {
  return { code, id: page.id, message };
}
function pageQualityWarnings(page, members) {
  const warnings = [];
  const content = members.filter((element) => isPageContent(element, page));
  const texts = content.filter((element) => str2(element.type) === "text" && str2(element.text).trim() !== "");
  const shapes = content.filter((element) => SHAPE_TYPES.has(str2(element.type)));
  const elementById = new Map(members.map((element) => [str2(element.id), element]));
  const pageTop = page.bounds.y;
  const pageBottom = page.bounds.y + page.bounds.height;
  const aboveFoldBottom = pageTop + page.bounds.height * 0.58;
  const aboveFold = content.filter((element) => num2(element.y) < aboveFoldBottom);
  if (content.length < 8) {
    warnings.push(qualityIssue(
      "page-content-too-sparse",
      page,
      `${page.name} only has ${content.length} visible content elements; add the information needed to understand the page's main task without falling back to empty space`
    ));
  }
  if (content.length > 52) {
    warnings.push(qualityIssue(
      "page-content-too-dense",
      page,
      `${page.name} has ${content.length} visible content elements; group or defer secondary information so the first screen stays scannable`
    ));
  }
  if (aboveFold.length < 4) {
    warnings.push(qualityIssue(
      "above-fold-content-insufficient",
      page,
      `${page.name} has only ${aboveFold.length} meaningful elements in the first screen; expose the page heading, current state, key content, and primary action above the fold`
    ));
  }
  const verticalBoxes = content.map((element) => ({ top: Math.max(pageTop, num2(element.y)), bottom: Math.min(pageBottom, num2(element.y) + num2(element.height)) })).sort((left, right) => left.top - right.top);
  let largestGap = verticalBoxes.length === 0 ? page.bounds.height : Math.max(0, verticalBoxes[0].top - pageTop);
  let coveredBottom = pageTop;
  for (const box of verticalBoxes) {
    largestGap = Math.max(largestGap, box.top - coveredBottom);
    coveredBottom = Math.max(coveredBottom, box.bottom);
  }
  largestGap = Math.max(largestGap, pageBottom - coveredBottom);
  if (largestGap > page.bounds.height * 0.34) {
    warnings.push(qualityIssue(
      "continuous-empty-space-too-large",
      page,
      `${page.name} contains an unexplained vertical empty region of about ${Math.round(largestGap)}px; rebalance the content flow or reserve the space with an explicit product purpose`
    ));
  }
  const fontSizes = texts.map((element) => num2(element.fontSize, 20));
  if (fontSizes.length >= 4 && Math.max(...fontSizes) - Math.min(...fontSizes) < 4) {
    warnings.push(qualityIssue(
      "text-scale-flat",
      page,
      `${page.name} uses nearly one text size for headings, content, and metadata; create at least a clear heading/body/supporting-text hierarchy`
    ));
  }
  const primaryActions = content.filter((element) => PRIMARY_ACTION_ROLES.has(elementRole(element)));
  const primaryActionIds = new Set(primaryActions.map((element) => str2(element.containerId) || str2(element.id)));
  if (primaryActionIds.size === 0) {
    warnings.push(qualityIssue(
      "primary-action-missing",
      page,
      `${page.name} has no semantic primary action; mark the one action that advances the page's core task with customData.role=primary-action`
    ));
  } else if (primaryActionIds.size > 1) {
    warnings.push(qualityIssue(
      "primary-action-ambiguous",
      page,
      `${page.name} exposes ${primaryActionIds.size} primary actions; keep one dominant action and demote the rest`
    ));
  }
  const statusTexts = texts.filter((element) => /进行中|待处理|已完成|已逾期|失败|成功|警告|异常|高优先级|低优先级/iu.test(str2(element.text)));
  const hasSemanticTone = (element) => {
    const ownTone = str2(customData2(element).tone).toLowerCase();
    if (ownTone !== "" && ownTone !== "neutral") return true;
    const container = elementById.get(str2(element.containerId));
    const containerTone = container === void 0 ? "" : str2(customData2(container).tone).toLowerCase();
    return containerTone !== "" && containerTone !== "neutral";
  };
  if (statusTexts.some((element) => !hasSemanticTone(element))) {
    warnings.push(qualityIssue(
      "status-emphasis-missing",
      page,
      `${page.name} contains status or priority text without emphasis on that status element or its bound container; use restrained success, warning, danger, or info tone to support fast scanning`
    ));
  }
  if (shapes.length >= 4) {
    const visualSignatures = new Set(shapes.map((element) => {
      const data = customData2(element);
      return [str2(data.tone).toLowerCase() || "neutral", str2(element.backgroundColor) || "transparent", str2(element.strokeWidth) || "1"].join("|");
    }));
    if (visualSignatures.size <= 1) {
      warnings.push(qualityIssue(
        "visual-hierarchy-flat",
        page,
        `${page.name} gives all major blocks the same fill, tone, and border weight; soften secondary regions and reserve stronger emphasis for the page's primary task`
      ));
    }
  }
  const outlinedShapes = shapes.filter((element) => {
    const background = str2(element.backgroundColor);
    return background === "" || background === "transparent";
  });
  if (shapes.length >= 5 && outlinedShapes.length / shapes.length >= 0.75) {
    warnings.push(qualityIssue(
      "border-overuse",
      page,
      `${page.name} draws ${outlinedShapes.length} of ${shapes.length} shapes as outline-only boxes; use spacing, grouping, and a few semantic fills instead of giving every item equal border weight`
    ));
  }
  for (const element of content) {
    if (!INTERACTIVE_ROLES.has(elementRole(element))) continue;
    if (str2(element.type) === "text") continue;
    if (num2(element.width) < 44 || num2(element.height) < 44) {
      warnings.push(issue(
        "tap-target-too-small",
        element,
        `${str2(element.id)} is ${Math.round(num2(element.width))}\xD7${Math.round(num2(element.height))}px; interactive controls should provide at least a 44\xD744px touch target`
      ));
    }
  }
  const leftOffsets = content.filter((element) => !isBottomNavigationMember(element) && num2(element.width) > page.bounds.width * 0.5).map((element) => Math.round(num2(element.x) - page.bounds.x));
  if (leftOffsets.length >= 4 && Math.max(...leftOffsets) - Math.min(...leftOffsets) > 20) {
    warnings.push(qualityIssue(
      "page-margin-inconsistent",
      page,
      `${page.name} uses inconsistent main-content left margins (${Math.min(...leftOffsets)}\u2013${Math.max(...leftOffsets)}px); align repeated blocks to a stable page grid`
    ));
  }
  const heightsByRole = /* @__PURE__ */ new Map();
  for (const element of content) {
    const role3 = elementRole(element);
    if (role3 === "") continue;
    const values = heightsByRole.get(role3) ?? [];
    values.push(num2(element.height));
    heightsByRole.set(role3, values);
  }
  for (const [role3, heights] of heightsByRole.entries()) {
    if (heights.length < 3 || Math.max(...heights) - Math.min(...heights) <= 8) continue;
    warnings.push(qualityIssue(
      "repeated-control-rhythm-inconsistent",
      page,
      `${page.name} repeats role=${role3} with heights from ${Math.round(Math.min(...heights))}px to ${Math.round(Math.max(...heights))}px; use a consistent component rhythm`
    ));
  }
  return warnings;
}
function inspectPrototypeQuality(elements) {
  const layout = inspectPrototypeLayout(elements);
  const pages = prototypePages(elements);
  const perPage = pages.map((page) => {
    const members = elements.filter((element) => pageForElement(element, pages)?.id === page.id);
    const warnings2 = pageQualityWarnings(page, members);
    return {
      pageId: page.id,
      pageName: page.name,
      qualityScore: Math.max(0, 100 - warnings2.length * 8),
      warnings: warnings2
    };
  });
  const warnings = [...layout.warnings, ...perPage.flatMap((page) => page.warnings)];
  const structurePassed = layout.errors.length === 0 && !layout.warnings.some((warning) => warning.code === "page-membership-ambiguous" || warning.code === "page-name-duplicate");
  const contentPassed = !warnings.some((warning) => CONTENT_WARNING_CODES.has(warning.code));
  return {
    structurePassed,
    contentPassed,
    layoutPassed: layout.errors.length === 0,
    visualReviewRequired: pages.length > 0,
    qualityScore: Math.max(0, 100 - layout.errors.length * 20 - warnings.length * 5),
    warnings,
    pages: perPage
  };
}
function formatLayoutIssues(issues) {
  return issues.map((item) => {
    const value = typeof item === "object" && item !== null ? item : {};
    const code = str2(value.code) || "layout-warning";
    const id = str2(value.id);
    const message = str2(value.message) || JSON.stringify(item);
    return `- ${code}${id === "" ? "" : ` [${id}]`}: ${message}`;
  }).join("\n");
}

// src/tools.ts
function text2(value) {
  return [{ type: "text", text: value }];
}
var MAX_ELEMENTS_JSON = 120 * 1024;
var SNAPSHOT_CACHE_MAX = 40;
var DEFAULT_BOARD = "prototype";
function str3(value) {
  return typeof value === "string" ? value : "";
}
function num3(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
function customData3(value) {
  return typeof value?.customData === "object" && value.customData !== null ? value.customData : {};
}
var boardCache = /* @__PURE__ */ new Map();
var pendingReviewWrites = /* @__PURE__ */ new Map();
var PENDING_REVIEW_WRITE_MAX = 20;
var PENDING_REVIEW_WRITE_TTL_MS = 10 * 6e4;
function prunePendingReviewWrites(now2 = Date.now()) {
  for (const [id, pending] of pendingReviewWrites) {
    if (now2 - pending.createdAt > PENDING_REVIEW_WRITE_TTL_MS) pendingReviewWrites.delete(id);
  }
  while (pendingReviewWrites.size >= PENDING_REVIEW_WRITE_MAX) {
    const oldest = [...pendingReviewWrites.values()].sort((a, b) => a.createdAt - b.createdAt)[0];
    if (oldest === void 0) break;
    pendingReviewWrites.delete(oldest.id);
  }
}
function rememberPendingReviewWrite(input) {
  prunePendingReviewWrites();
  const pending = { ...input, id: `pending-${randomUUID2()}`, createdAt: Date.now() };
  pendingReviewWrites.set(pending.id, pending);
  return pending;
}
function pendingReviewWriteFor(root, board, baseRev) {
  prunePendingReviewWrites();
  return [...pendingReviewWrites.values()].filter((pending) => pending.root === root && pending.board === board && Math.abs(pending.baseRev - baseRev) <= 0.5).sort((a, b) => b.createdAt - a.createdAt)[0] ?? null;
}
async function boardOperationalState(store, root, board, revision, scene) {
  const [reveal, representativeReview] = await Promise.all([
    store.getBoardReveal(root),
    store.getBoardReview(root, board, "representative")
  ]);
  if (!reveal.ok) throw new Error(`${reveal.error.code}: ${reveal.error.message}`);
  if (!representativeReview.ok) throw new Error(`${representativeReview.error.code}: ${representativeReview.error.message}`);
  const currentReveal = reveal.value.request !== null && reveal.value.request.board === board && Math.abs(reveal.value.request.revision - revision) <= 0.5 ? reveal.value.request : null;
  const currentRepresentativeReview = representativeReview.value.receipt !== null && Math.abs(representativeReview.value.receipt.revision - revision) <= 0.5 ? representativeReview.value.receipt : null;
  const pendingWrite = pendingReviewWriteFor(root, board, revision);
  let continuation2;
  if (pendingWrite !== null && currentRepresentativeReview !== null) {
    continuation2 = {
      status: "commit_pending_write",
      pendingUpdateId: pendingWrite.id,
      nextAction: {
        tool: "draw2code_update",
        arguments: { root, name: board, action: "commit_pending", pendingUpdateId: pendingWrite.id }
      }
    };
  } else if (pendingWrite !== null && currentReveal !== null) {
    continuation2 = {
      status: "review_representative",
      reviewToken: currentReveal.id,
      pendingUpdateId: pendingWrite.id,
      canvasAcknowledged: typeof currentReveal.consumedAt === "number",
      nextAction: {
        tool: "draw2code_update",
        arguments: { root, name: board, action: "review", reviewToken: currentReveal.id, phase: "representative" }
      }
    };
  } else if (currentReveal !== null) {
    continuation2 = {
      status: "review_available",
      reviewToken: currentReveal.id,
      canvasAcknowledged: typeof currentReveal.consumedAt === "number",
      nextAction: {
        tool: "draw2code_update",
        arguments: { root, name: board, action: "review", reviewToken: currentReveal.id }
      }
    };
  } else {
    continuation2 = { status: "idle", nextAction: null };
  }
  return {
    capacity: measureSceneCapacity(scene),
    continuation: continuation2
  };
}
async function resolveBoard(store, root, requested) {
  const active = await store.getActiveBoard(root);
  const activeBoard = active.ok && active.value.name !== null ? active.value.name : void 0;
  const requestedName = typeof requested === "string" ? requested.trim() : "";
  return {
    name: requestedName !== "" ? requestedName : activeBoard ?? DEFAULT_BOARD,
    activeBoard
  };
}
function typeName2(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "object") return "object";
  if (typeof value === "string") return `string(${value.length} chars)`;
  return typeof value;
}
function parseUpdateOps(input) {
  let source = input;
  if (typeof source === "string") {
    try {
      source = JSON.parse(source);
    } catch (error2) {
      throw new Error(`ops is not valid JSON: ${error2 instanceof Error ? error2.message : String(error2)}. Send an array like [{"op":"upsert","element":{...}}] or a JSON string encoding it`);
    }
  }
  if (!Array.isArray(source)) {
    throw new Error(`ops must be an array, got ${typeName2(source)}. Large payloads sometimes arrive as a JSON string (auto-parsed); if you still see this, check the ops argument is an array of op objects`);
  }
  return source.map((raw, index) => {
    const where = `ops[${index}]`;
    if (typeof raw !== "object" || raw === null) throw new Error(`${where} must be an object, got ${typeName2(raw)}`);
    const op = raw;
    const kind = str3(op.op);
    if (kind === "" && typeof op.element === "object" && op.element !== null) {
      const element = op.element;
      const elementId = str3(element.id);
      if (elementId === "") throw new Error(`${where}.element.id missing or not a string: every element needs a unique non-empty id`);
      return { op: "upsert", elementId, element };
    }
    if (kind === "" && str3(op.id) !== "" && str3(op.type) !== "") {
      return { op: "upsert", elementId: str3(op.id), element: op };
    }
    if (kind === "upsert") {
      if ((op.element === void 0 || op.element === null) && str3(op.id) !== "" && str3(op.type) !== "") {
        const element2 = { ...op };
        delete element2.op;
        return { op: "upsert", elementId: str3(element2.id), element: element2 };
      }
      if (typeof op.element !== "object" || op.element === null) {
        throw new Error(`${where} is "upsert" but missing its element: use {"op":"upsert","element":{"id":"x","type":"rectangle",...}}`);
      }
      const element = op.element;
      const elementId = str3(element.id);
      if (elementId === "") throw new Error(`${where}.element.id missing or not a string: every element needs a unique non-empty id`);
      return { op: "upsert", elementId, element };
    }
    if (kind === "delete") {
      const nestedElement = typeof op.element === "object" && op.element !== null ? op.element : void 0;
      const elementId = str3(op.id) || str3(op.elementId) || str3(nestedElement?.id);
      if (elementId === "") throw new Error(`${where} is "delete" but missing its id: use {"op":"delete","id":"<element id>"}`);
      return { op: "delete", elementId };
    }
    if (kind === "clear") return { op: "clear" };
    if (kind === "replace") {
      if (typeof op.scene !== "object" || op.scene === null) {
        throw new Error(`${where} is "replace" but missing its scene: use {"op":"replace","scene":{"elements":[...]}}`);
      }
      return { op: "replace", scene: op.scene };
    }
    throw new Error(`${where}.op = "${kind}" is invalid: must be one of upsert | delete | clear | replace. The most common mistake is forgetting the op field entirely`);
  });
}
function rejectNewPrototypeFrames(currentElements, ops) {
  const existingIds = new Set(currentElements.map((element) => str3(element.id)));
  const candidates = ops.flatMap((op) => {
    if (op.op === "upsert" && op.element !== void 0) return [op.element];
    if (op.op === "replace" && Array.isArray(op.scene?.elements)) {
      return op.scene.elements.filter((item) => typeof item === "object" && item !== null);
    }
    return [];
  });
  const invalid = candidates.find((element) => {
    return str3(element.type) === "frame" && str3(customData3(element).role).trim().toLowerCase() === "prototype-page" && !existingIds.has(str3(element.id));
  });
  if (invalid !== void 0) {
    throw new Error(`prototype-page-frame-deprecated: ${str3(invalid.id)} is a new prototype page using type=frame; use a rectangle with customData.role=prototype-page, customData.pageName, and an external prototype-page-label text instead`);
  }
}
function previewElements(currentElements, ops) {
  let elements = currentElements.slice();
  for (const op of ops) {
    if (op.op === "replace") {
      const next = op.scene?.elements;
      elements = Array.isArray(next) ? next.filter((item) => typeof item === "object" && item !== null) : [];
      continue;
    }
    if (op.op === "clear") {
      elements = [];
      continue;
    }
    if (op.op === "delete" && op.elementId !== void 0) {
      elements = elements.filter((element) => str3(element.id) !== op.elementId);
      continue;
    }
    if (op.op === "upsert" && op.elementId !== void 0 && op.element !== void 0) {
      const index = elements.findIndex((element) => str3(element.id) === op.elementId);
      if (index === -1) elements.push(op.element);
      else elements[index] = op.element;
    }
  }
  return elements;
}
function fitsInsideFrame(element, frame) {
  const tolerance = 2;
  const left = num3(element.x);
  const top = num3(element.y);
  const right = left + num3(element.width);
  const bottom = top + num3(element.height);
  const frameLeft = num3(frame.x);
  const frameTop = num3(frame.y);
  const frameRight = frameLeft + num3(frame.width);
  const frameBottom = frameTop + num3(frame.height);
  return left >= frameLeft - tolerance && top >= frameTop - tolerance && right <= frameRight + tolerance && bottom <= frameBottom + tolerance;
}
function normalizeFrameLocalCoordinates(currentElements, ops) {
  const prospectiveElements = previewElements(currentElements, ops);
  const frames = /* @__PURE__ */ new Map();
  for (const candidate of prospectiveElements) {
    if (str3(candidate.type) !== "frame" || str3(candidate.id) === "") continue;
    frames.set(str3(candidate.id), normalizeElement(candidate));
  }
  return ops.map((op) => {
    if (op.op !== "upsert" || op.element === void 0 || str3(op.element.type) === "frame") return op;
    const frame = frames.get(str3(op.element.frameId));
    if (frame === void 0) return op;
    const element = normalizeElement(op.element);
    if (fitsInsideFrame(element, frame)) return op;
    const shifted = normalizeElement({
      ...op.element,
      x: num3(element.x) + num3(frame.x),
      y: num3(element.y) + num3(frame.y)
    });
    if (!fitsInsideFrame(shifted, frame)) return op;
    return { ...op, element: shifted };
  });
}
function layoutFocusIds(ops) {
  if (ops.some((op) => op.op === "replace")) return void 0;
  const ids = /* @__PURE__ */ new Set();
  for (const op of ops) {
    if (op.op === "upsert" && op.elementId !== void 0) ids.add(op.elementId);
    if (op.op === "delete" && op.elementId !== void 0) ids.add(op.elementId);
  }
  return ids.size > 0 ? ids : void 0;
}
function layoutFocusIdsWithPages(ops, currentElements, prospectiveElements) {
  const focusIds = layoutFocusIds(ops);
  if (focusIds === void 0) return void 0;
  for (const elements of [currentElements, prospectiveElements]) {
    const pages = prototypePages(elements);
    for (const element of elements) {
      if (!focusIds.has(str3(element.id))) continue;
      const page = pageForElement(element, pages);
      if (page !== void 0) focusIds.add(page.id);
    }
  }
  return focusIds;
}
function normalizeSemanticUpserts(currentElements, ops) {
  const reconciled = reconcileBoundTextBindings(
    previewElements(currentElements, ops),
    layoutFocusIds(ops)
  );
  const byId = new Map(reconciled.map((element) => [str3(element.id), element]));
  return ops.map((op) => {
    if (op.op !== "upsert" || op.elementId === void 0) return op;
    const element = byId.get(op.elementId);
    return element === void 0 ? op : { ...op, element };
  });
}
function normalizePageShellUpserts(currentElements, ops) {
  const prospective = previewElements(currentElements, ops);
  const pages = prototypePages(prospective);
  const pageShellById = new Map(pages.filter((page) => page.kind === "page-shell").map((page) => [page.id, page]));
  const byId = new Map(prospective.map((element) => [str3(element.id), element]));
  const normalizeElementMembership = (element) => {
    const referencedPageShell = pageShellById.get(str3(element.frameId));
    const withoutFrame = { ...element, frameId: null };
    if (referencedPageShell !== void 0 && pageForElement(withoutFrame, pages)?.id !== referencedPageShell.id) {
      throw new Error(`layout-invalid:
- page-shell-child-coordinates-invalid [${str3(element.id)}]: children of ${referencedPageShell.name} must use canvas-absolute x/y inside the rectangle page shell; frame-local coordinates are supported only for legacy Frames`);
    }
    const page = pageForElement(element, pages);
    return referencedPageShell !== void 0 || page?.kind === "page-shell" ? withoutFrame : element;
  };
  return ops.map((op) => {
    if (op.op === "replace" && Array.isArray(op.scene?.elements)) {
      return {
        ...op,
        scene: {
          ...op.scene,
          elements: op.scene.elements.map((element2) => {
            return typeof element2 === "object" && element2 !== null ? normalizeElementMembership(element2) : element2;
          })
        }
      };
    }
    if (op.op !== "upsert" || op.elementId === void 0) return op;
    const element = byId.get(op.elementId);
    if (element === void 0) return op;
    return { ...op, element: normalizeElementMembership(element) };
  });
}
function validateNewPrototypePageContracts(currentElements, prospectiveElements) {
  const existingIds = new Set(currentElements.map((element) => str3(element.id)));
  const newPages = prototypePages(prospectiveElements).filter((page) => {
    return page.kind === "page-shell" && !existingIds.has(page.id);
  });
  const errors = [];
  for (const page of newPages) {
    const minimum = customData3(page.element).mockDataMin;
    if (typeof minimum !== "number" || !Number.isFinite(minimum) || minimum < 1) {
      errors.push(`prototype-page-mock-min-missing [${page.id}]: ${page.name} must set customData.mockDataMin to a positive number`);
    }
    const labels = prospectiveElements.filter((element) => {
      return str3(element.type) === "text" && str3(customData3(element).role).trim().toLowerCase() === "prototype-page-label" && str3(customData3(element).pageId) === page.id;
    });
    if (labels.length !== 1) {
      errors.push(`prototype-page-label-${labels.length === 0 ? "missing" : "ambiguous"} [${page.id}]: ${page.name} needs exactly one external prototype-page-label text with customData.pageId=${page.id}`);
      continue;
    }
    const label = labels[0];
    if (str3(label.text).trim() === "" || num3(label.y) + num3(label.height) > page.bounds.y + 2) {
      errors.push(`prototype-page-label-invalid [${str3(label.id)}]: ${page.name} label must contain readable text and sit above the rectangle page shell`);
    }
  }
  if (errors.length > 0) throw new Error(`layout-invalid:
${errors.map((error2) => `- ${error2}`).join("\n")}`);
}
function parseVisualReview(input) {
  if (typeof input !== "object" || input === null) return null;
  const value = input;
  const phase = str3(value.phase);
  if (phase !== "representative" && phase !== "final") return null;
  const inspectedPageIds = Array.isArray(value.inspectedPageIds) ? value.inspectedPageIds.filter((item) => typeof item === "string" && item.trim() !== "") : [];
  const observations = Array.isArray(value.observations) ? value.observations.filter((item) => typeof item === "string" && item.trim() !== "") : [];
  return {
    phase,
    passed: value.passed === true,
    boardRevision: typeof value.boardRevision === "number" && Number.isFinite(value.boardRevision) ? value.boardRevision : -1,
    revealRequestId: str3(value.revealRequestId),
    inspectedPageIds,
    observations
  };
}
function parseReviewAction(args) {
  const phase = str3(args.phase);
  if (phase !== "representative" && phase !== "final") {
    throw new Error("visual-review-invalid: action=review requires phase=representative or phase=final");
  }
  const inspectedPageIds = Array.isArray(args.inspectedPageIds) ? args.inspectedPageIds.filter((item) => typeof item === "string" && item.trim() !== "") : [];
  const observations = Array.isArray(args.observations) ? args.observations.filter((item) => typeof item === "string" && item.trim() !== "") : [];
  if (args.passed !== true) throw new Error("visual-review-failed: passed must be true before the workflow can continue");
  if (inspectedPageIds.length === 0) throw new Error("visual-review-invalid: inspectedPageIds must include at least one visible page id");
  if (observations.length === 0) throw new Error("visual-review-invalid: observations must describe what was visibly checked");
  return { phase, passed: true, inspectedPageIds, observations };
}
async function validateVisualReviewEvidence(store, root, boardName, boardRevision, evidence) {
  if (evidence === null) return;
  if (boardRevision === null || Math.abs(evidence.boardRevision - boardRevision) > 0.5) {
    throw new Error(`visual-review-stale: evidence revision ${evidence.boardRevision} does not match current board revision ${boardRevision ?? "missing"}; inspect the latest visible board before reviewing`);
  }
  const reveal = await store.getBoardReveal(root);
  if (!reveal.ok) throw new Error(`${reveal.error.code}: ${reveal.error.message}`);
  const request = reveal.value.request;
  if (request === null || request.id !== evidence.revealRequestId || request.board !== boardName) {
    throw new Error("visual-review-stale: revealRequestId is missing, belongs to another board, or is no longer the latest visible-board reveal; use the rev and revealRequestId from the most recent successful update");
  }
  if (request.revision !== boardRevision) {
    throw new Error(`visual-review-stale: reveal request revision ${request.revision} does not match current board revision ${boardRevision ?? "missing"}`);
  }
  if (typeof request.consumedAt !== "number") {
    throw new Error("visual-review-not-visible: the browser has not acknowledged opening this reveal request; wait for \u753B\u7801 to open before submitting visualReview");
  }
}
function validatePhasedDrawing(currentElements, prospectiveElements, visualReview, storedRepresentativeReviewed = false) {
  const currentPages = prototypePages(currentElements);
  const currentPageIds = new Set(currentPages.map((page) => page.id));
  const newPages = prototypePages(prospectiveElements).filter((page) => !currentPageIds.has(page.id));
  if (currentPages.length === 0 && newPages.length >= 3) {
    throw new Error("visual-review-required: first draw one representative page, inspect it in the visible \u753B\u7801 canvas, then add the remaining pages; do not author three or more unseen pages in the first batch");
  }
  if (currentPages.length > 0 && currentPages.length < 3 && newPages.length > 0 && prototypePages(prospectiveElements).length >= 3) {
    const representativeReviewed = visualReview?.phase === "representative" && visualReview.passed && visualReview.observations.length > 0 && visualReview.inspectedPageIds.some((id) => currentPageIds.has(id));
    if (!representativeReviewed && !storedRepresentativeReviewed) {
      throw new Error("visual-review-required: before adding multiple remaining pages, visibly inspect the existing representative page and call draw2code_update with action=review, the latest reviewToken, phase=representative, passed=true, inspectedPageIds and observations");
    }
  }
}
function reviewedEveryPage(evidence, pages) {
  if (pages.length === 0) return false;
  if (evidence?.phase !== "final" || !evidence.passed || evidence.observations.length === 0) return false;
  const reviewed = new Set(evidence.inspectedPageIds);
  return pages.every((page) => reviewed.has(page.id));
}
function layoutWarnings(elements) {
  const report = inspectPrototypeLayout(elements);
  return [...report.errors, ...report.warnings].map((item) => ({
    code: item.code,
    ...item.id === void 0 ? {} : { id: item.id },
    message: item.message
  }));
}
function prototypeQualitySummary(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return "";
  const qualityScore = typeof value.qualityScore === "number" ? value.qualityScore : 0;
  const warnings = Array.isArray(value.warnings) ? value.warnings.length : 0;
  return `prototype quality: ${qualityScore}/100 \xB7 warnings ${warnings}`;
}
function makeKey(root, name) {
  return `${root}::${name}`;
}
function snapshotElementsById(elements) {
  const map = /* @__PURE__ */ new Map();
  for (const element of elements) {
    const id = str3(element.id);
    if (id !== "") map.set(id, element);
  }
  return map;
}
function diffSummaries(before, after) {
  const beforeMap = snapshotElementsById(before);
  const afterMap = snapshotElementsById(after);
  const added = [];
  const removed = [];
  const modified = [];
  for (const [id, afterElement] of afterMap.entries()) {
    const beforeElement = beforeMap.get(id);
    if (beforeElement === void 0) {
      added.push(elementSummary(afterElement));
      continue;
    }
    if (JSON.stringify(beforeElement) !== JSON.stringify(afterElement)) {
      modified.push(`${elementSummary(beforeElement)} -> ${elementSummary(afterElement)}`);
    }
  }
  for (const [id, beforeElement] of beforeMap.entries()) {
    if (afterMap.has(id)) continue;
    removed.push(elementSummary(beforeElement));
  }
  return { added, removed, modified };
}
function computeChangeIds(before, after) {
  const beforeMap = snapshotElementsById(before);
  const afterMap = snapshotElementsById(after);
  const added = /* @__PURE__ */ new Set();
  const removed = /* @__PURE__ */ new Set();
  const modified = /* @__PURE__ */ new Set();
  for (const [id, afterElement] of afterMap.entries()) {
    if (!beforeMap.has(id)) {
      added.add(id);
      continue;
    }
    const beforeElement = beforeMap.get(id);
    if (beforeElement === void 0) continue;
    if (JSON.stringify(beforeElement) !== JSON.stringify(afterElement)) modified.add(id);
  }
  for (const [id] of beforeMap.entries()) {
    if (!afterMap.has(id)) removed.add(id);
  }
  return { added, removed, modified };
}
function summarizePlan(ops, currentElements) {
  const added = [];
  const removed = [];
  const modified = [];
  const currentById = snapshotElementsById(currentElements);
  for (const op of ops) {
    if (op.op === "replace") {
      added.push("replace \u6574\u9875");
      continue;
    }
    if (op.op === "clear") {
      removed.push("clear \u6E05\u7A7A\u6574\u9875");
      continue;
    }
    if (op.op === "delete" && op.elementId !== void 0) {
      const before = currentById.get(op.elementId);
      removed.push(before === void 0 ? `delete ${op.elementId}` : `delete ${elementSummary(before)}`);
      continue;
    }
    if (op.op === "upsert" && op.elementId !== void 0 && op.element !== void 0) {
      if (currentById.has(op.elementId)) {
        const before = currentById.get(op.elementId);
        modified.push(`upsert ${elementSummary(before)} -> ${elementSummary(op.element)}`);
      } else {
        added.push(`upsert ${elementSummary(op.element)}`);
      }
    }
  }
  return { added, removed, modified };
}
function renderChangeSummary(title, summary) {
  const chunks = [];
  if (summary.added.length > 0) chunks.push(`\u65B0\u589E: ${summary.added.slice(0, 6).join("\uFF1B")}${summary.added.length > 6 ? "\u2026" : ""}`);
  if (summary.removed.length > 0) chunks.push(`\u5220\u9664: ${summary.removed.slice(0, 6).join("\uFF1B")}${summary.removed.length > 6 ? "\u2026" : ""}`);
  if (summary.modified.length > 0) chunks.push(`\u4FEE\u6539: ${summary.modified.slice(0, 6).join("\uFF1B")}${summary.modified.length > 6 ? "\u2026" : ""}`);
  const body = chunks.length === 0 ? "\u65E0\u660E\u663E\u5143\u7D20\u53D8\u5316" : chunks.join("\n");
  return `${title}\uFF1A${body}`;
}
function buildPlanMessage(userChanges, plannedChanges, conflicts) {
  const lines = [];
  lines.push(renderChangeSummary("1) \u4E0A\u4E00\u8F6E\u4F60\u624B\u5DE5\u6539\u52A8", userChanges));
  lines.push(renderChangeSummary("2) \u8FD9\u4E00\u8F6E\u62DF\u6539", plannedChanges));
  if (conflicts.length === 0) {
    lines.push("3) \u51B2\u7A81\uFF1A\u65E0");
    return lines.join("\n");
  }
  lines.push("3) \u51B2\u7A81\uFF1A\u6709");
  for (const conflict of conflicts) {
    const target = conflict.elementId ? `\uFF08ID: ${conflict.elementId}\uFF09` : "";
    const before = conflict.before ? ` \u65E7:${conflict.before}` : "";
    const after = conflict.after ? ` \u65B0:${conflict.after}` : "";
    lines.push(`- ${conflict.op}${target}: ${conflict.reason}${before}${after}`);
  }
  return lines.join("\n");
}
function elementSummary(element) {
  const type = str3(element.type);
  if (type === "text") {
    const text3 = str3(element.text);
    return `${type}#${str3(element.id)} ${text3.slice(0, 48)}`;
  }
  return `${type}#${str3(element.id)}`;
}
function touchedByManualChange(userChanges) {
  if (userChanges === null) return /* @__PURE__ */ new Set();
  const touched = /* @__PURE__ */ new Set();
  for (const id of userChanges.added) touched.add(id);
  for (const id of userChanges.removed) touched.add(id);
  for (const id of userChanges.modified) touched.add(id);
  return touched;
}
function stableJson(value) {
  return JSON.stringify(value);
}
function elementRole2(element) {
  if (typeof element.customData !== "object" || element.customData === null) return "";
  return str3(element.customData.role).toLowerCase();
}
function authoredElementMatches(expected, actual, elementsById) {
  const volatile = /* @__PURE__ */ new Set(["updated", "seed", "versionNonce"]);
  for (const [key, value] of Object.entries(expected)) {
    if (volatile.has(key)) continue;
    if (expected.type === "text" && (key === "textAlign" || key === "verticalAlign")) {
      const container = elementsById.get(str3(actual.containerId));
      const role3 = container === void 0 || elementRole2(container) === "" ? elementRole2(actual) : elementRole2(container);
      const alignment = semanticTextAlignment(role3);
      if (alignment !== null && actual.textAlign === alignment.textAlign && actual.verticalAlign === alignment.verticalAlign) continue;
    }
    if (expected.type === "text" && key === "containerId" && typeof value === "string" && actual.containerId === null && actual.frameId === value) {
      continue;
    }
    if (key === "boundElements") {
      if (value === null) continue;
      if (!Array.isArray(value) || !Array.isArray(actual[key])) return false;
      const actualBindings = actual[key];
      if (!value.every((binding) => actualBindings.some((candidate) => stableJson(candidate) === stableJson(binding)))) return false;
      continue;
    }
    if (stableJson(actual[key]) !== stableJson(value)) return false;
  }
  if (expected.type === "text") {
    if (stableJson(actual.text) !== stableJson(expected.text)) return false;
    if (stableJson(actual.originalText) !== stableJson(expected.text)) return false;
  }
  return true;
}
function verifyAppliedOps(ops, elements) {
  const byId = new Map(elements.map((element) => [str3(element.id), element]));
  const finalOpById = /* @__PURE__ */ new Map();
  for (const op of ops) {
    if (op.op === "clear" || op.op === "replace") {
      finalOpById.clear();
      continue;
    }
    if (op.elementId !== void 0) finalOpById.set(op.elementId, op);
  }
  for (const op of finalOpById.values()) {
    if (op.op === "upsert" && op.elementId !== void 0) {
      const actual = byId.get(op.elementId);
      if (actual === void 0) return `upsert target ${op.elementId} is missing after write`;
      if (!authoredElementMatches(op.element, actual, byId)) {
        return `upsert target ${op.elementId} does not match the requested element after write`;
      }
    }
    if (op.op === "delete" && op.elementId !== void 0 && byId.has(op.elementId)) {
      return `delete target ${op.elementId} is still present after write`;
    }
  }
  return null;
}
function buildUpdatePlan(currentElements, ops, safeMode, touchedManualIds, hasSnapshot) {
  const currentById = /* @__PURE__ */ new Map();
  for (const el of currentElements) {
    const id = str3(el.id);
    if (id !== "") currentById.set(id, el);
  }
  const conflicts = [];
  for (const op of ops) {
    if (op.op === "replace") {
      if (!safeMode) continue;
      if (!hasSnapshot && currentById.size === 0) continue;
      conflicts.push({ op: "replace", reason: "replace \u4E3A\u6574\u9875\u66FF\u6362\uFF0C\u53EF\u80FD\u8986\u76D6\u7528\u6237\u6700\u8FD1\u6539\u52A8" });
      continue;
    }
    if (op.op === "clear") {
      if (!safeMode) continue;
      if (!hasSnapshot && currentById.size === 0) continue;
      conflicts.push({ op: "clear", reason: "clear \u4F1A\u6E05\u7A7A\u753B\u677F\uFF0C\u53EF\u80FD\u6E05\u6389\u7528\u6237\u521A\u4FEE\u6539\u7684\u5185\u5BB9" });
      continue;
    }
    if (op.op === "delete" && op.elementId !== void 0 && currentById.has(op.elementId)) {
      if (!safeMode) continue;
      if (touchedManualIds.size > 0 && !touchedManualIds.has(op.elementId)) continue;
      const before = elementSummary(currentById.get(op.elementId));
      conflicts.push({ op: "delete-existing", reason: "\u8981\u5220\u9664\u73B0\u6709\u5143\u7D20\uFF0C\u53EF\u80FD\u51B2\u7A81\u5230\u7528\u6237\u624B\u5DE5\u4FEE\u6539\u6216\u5220\u9664\u540E\u7684\u7ED3\u679C", elementId: op.elementId, before });
      continue;
    }
    if (op.op === "upsert" && op.elementId !== void 0 && currentById.has(op.elementId)) {
      if (!safeMode) continue;
      if (touchedManualIds.size > 0 && !touchedManualIds.has(op.elementId)) continue;
      const before = elementSummary(currentById.get(op.elementId));
      const after = elementSummary(op.element);
      conflicts.push({ op: "modify-existing", reason: "\u8981\u4FEE\u6539\u73B0\u6709\u5143\u7D20\uFF0C\u53EF\u80FD\u8986\u76D6\u7528\u6237\u521A\u6539\u7684\u5185\u5BB9", elementId: op.elementId, before, after });
    }
  }
  if (!hasSnapshot) return conflicts;
  if (touchedManualIds.size > 0 || conflicts.some((item) => item.op === "replace" || item.op === "clear")) {
    return conflicts;
  }
  return [];
}
function rememberSnapshot(key, snapshot) {
  boardCache.set(key, snapshot);
  while (boardCache.size > SNAPSHOT_CACHE_MAX) {
    const first = boardCache.keys().next();
    if (first.done) break;
    boardCache.delete(first.value);
  }
}
function describeElement(el) {
  const type = str3(el.type);
  const id = str3(el.id);
  const geom = `@${Math.round(num3(el.x))},${Math.round(num3(el.y))} ${Math.round(num3(el.width))}x${Math.round(num3(el.height))}`;
  if (type === "text") {
    const body = str3(el.text).replace(/\n/g, "\\n").slice(0, 60);
    return `${id} text ${geom} "${body}"`;
  }
  if (type === "frame") return `${id} frame ${geom} "${str3(el.name)}"`;
  return `${id} ${type} ${geom}`;
}
function draw2codeListTool(store) {
  return defineTool({
    name: "draw2code_list",
    description: "List \u753B\u7801 (Draw2Code) prototype boards of one workspace (name, revision, element count, updated time). Triggers: \u753B\u677F / \u539F\u578B / draw2code / prototype board listing.",
    parameters: {
      root: { type: "string", required: true, description: "Workspace root (the session working directory)." }
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          activeBoard: { type: "string" },
          scenes: {
            type: "array",
            required: true,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                name: { type: "string", required: true },
                rev: { type: "number", required: true },
                elementCount: { type: "integer", required: true },
                updatedAt: { type: "number", required: true }
              }
            }
          }
        }
      },
      render: (_args, value) => text2(
        (value.scenes ?? []).length === 0 ? "no boards yet (draw2code/ is empty or absent)" : [
          `\u5F53\u524D\u753B\u677F: ${value.activeBoard ?? "\uFF08\u672A\u8BB0\u5F55\uFF09"}`,
          "name | elements | updatedAt",
          "--- | --- | ---",
          ...(value.scenes ?? []).map((s) => `${s.name} | ${s.elementCount} | ${new Date(s.updatedAt).toISOString()}`)
        ].join("\n")
      )
    },
    async execute(args) {
      const result = await store.list(args.root);
      if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
      const active = await store.getActiveBoard(args.root);
      return active.ok && active.value.name !== null ? { scenes: result.value, activeBoard: active.value.name } : { scenes: result.value };
    }
  });
}
function draw2codeReadTool(store) {
  return defineTool({
    name: "draw2code_read",
    description: "Read one \u753B\u7801 prototype board: current elements, exact scene capacity, and continuation with opaque review/pending IDs plus executable next-action arguments. Call this once before editing an existing board; do not search chat history for reviewToken or pendingUpdateId. A new independent small edit may proceed even when an older review is available; only resume continuation when it belongs to the user's current requested batch. Also required before generating frontend pages. Triggers: \u67E5\u770B\u753B\u677F / \u8BFB\u539F\u578B / board read.",
    parameters: {
      root: { type: "string", required: true, description: "Workspace root (the session working directory)." },
      name: { type: "string", description: "Board name. Omit to use the board currently selected in the \u753B\u7801 UI." }
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          rev: { type: "number", required: true },
          board: { type: "string", required: true },
          activeBoard: { type: "string" },
          elementCount: { type: "integer", required: true },
          summary: { type: "string", required: true },
          layoutWarnings: { type: "array", items: { type: "json" }, required: true },
          prototypeQuality: { type: "json", required: true },
          capacity: { type: "json", required: true },
          continuation: { type: "json", required: true },
          pageNames: { type: "array", items: { type: "string" }, required: true },
          pages: { type: "array", items: { type: "json" }, required: true },
          pageRelations: { type: "array", items: { type: "json" }, required: true },
          frameNames: { type: "array", items: { type: "string" }, required: true },
          file: { type: "string", required: true },
          elements: { type: "json", required: true }
        }
      },
      render: (_args, value) => text2(
        [
          `board: ${value.board ?? ""} \xB7 ${value.elementCount ?? 0} elements`,
          `pages: ${(value.pageNames ?? []).join("\u3001") || "\uFF08\u672A\u8BC6\u522B\uFF09"} \xB7 relations: ${value.pageRelations?.length ?? 0}`,
          `capacity: ${num3(recordValue(value.capacity)?.usedBytes)}/${num3(recordValue(value.capacity)?.maxBytes)} bytes \xB7 continuation: ${str3(recordValue(value.continuation)?.status) || "idle"}`,
          value.activeBoard !== void 0 && value.activeBoard !== value.board ? `\u5F53\u524D\u753B\u677F: ${value.activeBoard}\uFF08\u4E0E\u8BFB\u53D6\u76EE\u6807\u4E0D\u540C\uFF09` : "",
          (value.layoutWarnings ?? []).length > 0 ? `\u539F\u578B\u8D28\u91CF\u63D0\u9192\uFF1A
${formatLayoutIssues(value.layoutWarnings ?? [])}` : "",
          prototypeQualitySummary(value.prototypeQuality),
          value.summary ?? "",
          value.file !== void 0 ? `file: ${value.file}` : ""
        ].filter(Boolean).join("\n")
      )
    },
    async execute(args) {
      const target = await resolveBoard(store, args.root, args.name);
      const result = await store.read(args.root, target.name);
      if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
      const { rev, scene } = result.value;
      const pages = prototypePages(scene.elements);
      const relations = prototypePageRelations(scene.elements, pages);
      const qualityWarnings = [
        ...layoutWarnings(scene.elements),
        ...pageMembershipWarnings(scene.elements, pages)
      ].filter((warning, index, all) => all.findIndex((candidate) => JSON.stringify(candidate) === JSON.stringify(warning)) === index);
      const prototypeQuality = inspectPrototypeQuality(scene.elements);
      const operational = await boardOperationalState(store, args.root, target.name, rev, scene);
      const summary = scene.elements.map(describeElement).join("\n");
      const elementsJson = JSON.stringify(scene.elements);
      const elementsBytes = Buffer.byteLength(elementsJson, "utf8");
      const payload = elementsBytes <= MAX_ELEMENTS_JSON ? scene.elements : [{ id: "__too_large__", type: "text", text: `elements JSON is ${elementsBytes} UTF-8 bytes (> ${MAX_ELEMENTS_JSON}); read the file directly instead` }];
      return {
        rev,
        board: target.name,
        ...target.activeBoard !== void 0 ? { activeBoard: target.activeBoard } : {},
        elementCount: scene.elements.length,
        pageNames: pages.map((page) => page.name),
        pages: publicPrototypePages(scene.elements, pages),
        pageRelations: relations,
        frameNames: pages.map((page) => page.name),
        summary,
        layoutWarnings: qualityWarnings,
        prototypeQuality,
        ...operational,
        file: `draw2code/${target.name}.excalidraw.json`,
        elements: payload
      };
    }
  });
}
function draw2codeUpdateTool(store) {
  return defineTool({
    name: "draw2code_update",
    description: `Draw on / edit one \u753B\u7801 prototype board with ops \u2014 this is how you turn the user's idea into a visible prototype in the right sidebar. Canonical ops: {op:"upsert",element:{...}} (insert or replace by id), {op:"delete",id}, {op:"clear"}, {op:"replace",scene:{elements:[...]}}. Elements need id + type (rectangle|text|arrow|line|ellipse|diamond|frame) + x/y/width/height (+text for text); missing fields are defaulted. Unambiguous upsert shorthands are accepted: a direct {id,type,...} element, {element:{...}} without op, or flat {op:"upsert",id,type,...}. Delete also accepts elementId or element.id when op="delete". Canvas-absolute x/y are canonical. New prototype pages use an ordinary rectangle with customData.role=prototype-page, customData.pageName, and customData.mockDataMin; add a separate text above it with role=prototype-page-label and pageId. Keep all new-page children frameId=null so user-drawn cross-page arrows cannot be clipped. Existing named Frames remain supported; their unambiguous frame-local coordinates are still converted for compatibility. The board is auto-created when absent. Triggers: \u753B\u539F\u578B / \u753B\u4E00\u4E0B / \u5728\u753B\u677F\u4E0A\u2026 / draw the prototype / update the board. Low-fi quality is checked before writing: multiline text needs enough height, shape text must be a separate text element, and bottom navigation must use a semantic shell in the page bottom safe area. A completed page from draw2code_create must use a rectangle page shell with role=prototype-page, pageName, and mockDataMin (normally 3), plus an external prototype-page-label; mark each visible realistic example text with role=mock-data. Empty boxes and placeholder labels do not satisfy the content gate. Use semantic roles as a component API: page-heading/page-header for headers, content-card/task-card/stat-card/category-card for information blocks, input/select/search-field for form fields, chip/filter-chip for choices, bottom-navigation plus bottom-navigation-item for global navigation, and exactly one primary-action for the page's main task. Page membership is inferred from canvas geometry; containerId is only for one visible label bound to a rectangle/diamond/ellipse. New page children must keep frameId=null. Existing legacy Frame pages and their frameId children remain supported and are never migrated implicitly. For a one-label shape, set the text containerId to the shape id and declare customData.role on the shape or label: button/primary-action/chip/tab labels become center/middle, while input/select/dropdown/search-field values stay left/middle. Missing component roles are rejected instead of silently defaulting labels to the top-left. The tool completes Excalidraw's reciprocal boundElements relation so the label is visible on first render. A bottom-navigation shell uses separate text labels with customData.role=bottom-navigation-item so each slot is centered. Use customData.tone=primary|success|warning|danger|info|neutral on category/status/action shapes for restrained semantic color; explicit strokeColor/backgroundColor always win. Invalid layout returns layout-invalid and is not written. For three or more pages, obey create.drawingPlan and write only the representative page first. After the returned reviewToken is visible in Canvas, call action=review with phase=representative; this pure review does not write or publish another reveal. Then write the remaining pages and finish with action=review phase=final. If remaining-page ops arrive before representative review, the tool preserves them and returns pendingUpdateId; after review, call action=commit_pending with that id and do not regenerate or resend the ops. verified/writeVerified only prove persistence; report completion only when completionReady=true. Omit name to target the board currently selected in the \u753B\u7801 UI; only pass name when the user explicitly names another board. Never edit the scene file with Bash or another direct file-writing path; use this tool so conflicts and read-back verification are enforced.`,
    parameters: {
      root: { type: "string", required: true, description: "Workspace root (the session working directory)." },
      name: { type: "string", description: "Board name. Omit to target the board currently selected in the \u753B\u7801 UI." },
      action: { type: "string", enum: ["write", "review", "commit_pending"], description: "write applies ops (default). review records a visible-canvas review without writing the board or publishing a new reveal. commit_pending applies a previously preserved batch after representative review." },
      ops: { type: "json", description: 'Required for action=write. Ops array (or a JSON string encoding it). For a new page, first upsert {id:"page",type:"rectangle",customData:{role:"prototype-page",pageName:"\u9996\u9875",mockDataMin:3},x,y,width,height}, then an external prototype-page-label text and page children with canvas-absolute coordinates and frameId=null. Direct elements, {element:{...}} without op, and flat upserts are accepted when id+type make the intent unambiguous. Delete accepts id, elementId, or element.id. Legacy named Frames remain compatible, including unambiguous frame-local child coordinate conversion.' },
      force: { type: "boolean", description: "\u5DF2\u8BFB\u5230\u51B2\u7A81\u5E76\u4E14\u7528\u6237\u786E\u8BA4\u540E\u53EF\u8BBE\u7F6E\u4E3A true\uFF0C\u5F3A\u5236\u6267\u884C\u3002\u9ED8\u8BA4 false\u3002" },
      safeMode: { type: "boolean", description: "\u662F\u5426\u5728\u6709\u98CE\u9669\u6539\u52A8\u65F6\u8981\u6C42\u786E\u8BA4\uFF08\u9ED8\u8BA4 true\uFF09\u3002\u8BBE\u4E3A false \u4F1A\u76F4\u63A5\u6267\u884C\uFF0C\u53EF\u80FD\u8986\u76D6\u7528\u6237\u624B\u5DE5\u6539\u52A8\u3002" },
      reviewToken: { type: "string", description: "Opaque token returned by the latest successful write. Required for action=review." },
      phase: { type: "string", enum: ["representative", "final"], description: "Review phase for action=review." },
      passed: { type: "boolean", description: "Set true only after the requested pages are visibly inspected." },
      inspectedPageIds: { type: "array", items: { type: "string" }, description: "Visible page-shell ids inspected during action=review." },
      observations: { type: "array", items: { type: "string" }, description: "Concrete visible observations from the review." },
      pendingUpdateId: { type: "string", description: "Preserved write batch returned when representative review is the only blocker. Use with action=commit_pending; do not resend the original ops." },
      visualReview: { type: "json", description: "Deprecated compatibility input. New calls use action=review with reviewToken, phase, passed, inspectedPageIds and observations, without ops." }
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          rev: { type: "number", required: true },
          targetBoard: { type: "string", required: true },
          activeBoard: { type: "string" },
          elementCount: { type: "integer", required: true },
          applied: { type: "integer", required: true },
          verified: { type: "boolean", required: true },
          writeVerified: { type: "boolean", required: true },
          reviewVerified: { type: "boolean" },
          completionReady: { type: "boolean", required: true },
          nextAction: { type: "string", required: true },
          nextActionCode: { type: "string" },
          nextActionParams: { type: "json" },
          capacity: { type: "json" },
          timings: { type: "json" },
          prototypeQuality: { type: "json", required: true },
          revealRequestId: { type: "string" },
          reviewToken: { type: "string" },
          reviewRequest: { type: "json" },
          pendingUpdateId: { type: "string" },
          layoutWarnings: { type: "array", items: { type: "json" }, required: true },
          requiresConfirmation: { type: "boolean" },
          pending: { type: "boolean" },
          conflicts: { type: "array", items: { type: "json" } },
          planSummary: { type: "string" },
          userSummary: { type: "string" },
          summary: {
            type: "object",
            additionalProperties: false,
            properties: {
              userChanges: { type: "json" },
              plannedChanges: { type: "json" }
            }
          }
        }
      },
      render: (_args, value) => text2(
        value.pending === true ? `\u3010\u5F85\u786E\u8BA4\u3011\u68C0\u6D4B\u5230\u6F5C\u5728\u51B2\u7A81\uFF08${value.conflicts?.length ?? 0} \u6761\uFF09\uFF1A
${value.planSummary ?? ""}
\u8BF7\u5148\u786E\u8BA4\u540E\u518D\u91CD\u8BD5\uFF1A\u5728\u4F60\u786E\u8BA4\u4E86\u4E4B\u540E\uFF0C\u8BF7\u91CD\u65B0\u8C03\u7528 draw2code_update \u5E76\u8BBE\u7F6E force=true\u3002` : `board ${value.targetBoard ?? ""}. verified=${value.verified === true}; writeVerified=${value.writeVerified === true}; reviewVerified=${value.reviewVerified === true}; completionReady=${value.completionReady === true}; visualReviewRequired=${value.prototypeQuality !== null && typeof value.prototypeQuality === "object" && value.prototypeQuality.visualReviewRequired === true}; boardRevision=${value.rev ?? "missing"}; revealRequestId=${value.revealRequestId ?? "missing"}; reviewToken=${value.reviewToken ?? "missing"}; pendingUpdateId=${value.pendingUpdateId ?? "none"}. ${value.applied ?? 0} ops applied, ${value.elementCount ?? 0} elements on board. nextAction=${value.nextActionCode ?? value.nextAction ?? ""}. ${value.nextAction ?? ""}${recordValue(value.timings)?.totalMs === void 0 ? "" : ` toolTime=${num3(recordValue(value.timings)?.totalMs)}ms.`}${value.writeVerified === true ? " The \u753B\u7801 sidebar opens automatically on this board." : ""}${(value.layoutWarnings ?? []).length > 0 ? `
\u7ED3\u6784\u4E0E\u5E03\u5C40\u63D0\u9192\uFF1A
${formatLayoutIssues(value.layoutWarnings ?? [])}` : ""}`
      )
    },
    async execute(args) {
      const startedAt = performance.now();
      const stageTimings = { readMs: 0, preflightMs: 0, writeMs: 0, verificationMs: 0, publishMs: 0 };
      let firstEffectiveWriteAt = null;
      const rounded = (value) => Math.round(value * 10) / 10;
      const timings = () => ({
        scope: "tool-execution",
        excludes: "agent-reasoning-before-tool-call",
        readMs: rounded(stageTimings.readMs),
        preflightMs: rounded(stageTimings.preflightMs),
        writeMs: rounded(stageTimings.writeMs),
        verificationMs: rounded(stageTimings.verificationMs),
        publishMs: rounded(stageTimings.publishMs),
        totalMs: rounded(performance.now() - startedAt),
        timeToFirstEffectiveWriteMs: firstEffectiveWriteAt === null ? null : rounded(firstEffectiveWriteAt - startedAt)
      });
      const safeMode = args.safeMode !== false;
      const force = args.force === true;
      const visualReview = parseVisualReview(args.visualReview);
      let parsedOps = args.ops === void 0 ? [] : parseUpdateOps(args.ops);
      let targetName = args.name;
      let pendingCommit = null;
      const requestedAction = args.action ?? (visualReview !== null && parsedOps.length === 0 ? "review" : "write");
      const action = requestedAction === "commit_pending" ? "write" : requestedAction;
      if (requestedAction === "commit_pending") {
        if (typeof args.pendingUpdateId !== "string" || args.pendingUpdateId === "") {
          throw new Error("pending-update-invalid: action=commit_pending requires pendingUpdateId");
        }
        prunePendingReviewWrites();
        pendingCommit = pendingReviewWrites.get(args.pendingUpdateId) ?? null;
        if (pendingCommit === null || pendingCommit.root !== args.root) {
          throw new Error("pending-update-stale: pendingUpdateId is missing, expired, or belongs to another workspace");
        }
        if (targetName !== void 0 && targetName !== pendingCommit.board) {
          throw new Error("pending-update-stale: pendingUpdateId belongs to another board");
        }
        targetName = pendingCommit.board;
        parsedOps = pendingCommit.ops;
      }
      if (action === "review") {
        if (parsedOps.length > 0) throw new Error("visual-review-requires-empty-ops: action=review cannot mutate the board");
        const target2 = await resolveBoard(store, args.root, targetName);
        const readStartedAt2 = performance.now();
        const board2 = await store.read(args.root, target2.name);
        stageTimings.readMs += performance.now() - readStartedAt2;
        if (!board2.ok) throw new Error(`${board2.error.code}: ${board2.error.message}`);
        const evidence = visualReview === null ? parseReviewAction(args) : {
          phase: visualReview.phase,
          passed: visualReview.passed,
          inspectedPageIds: visualReview.inspectedPageIds,
          observations: visualReview.observations
        };
        const reviewToken = args.reviewToken ?? visualReview?.revealRequestId ?? "";
        if (reviewToken === "") throw new Error("visual-review-invalid: action=review requires reviewToken from the latest successful write");
        if (visualReview !== null) {
          await validateVisualReviewEvidence(store, args.root, target2.name, board2.value.rev, visualReview);
        }
        const pages2 = prototypePages(board2.value.scene.elements);
        const pageIds = new Set(pages2.map((page) => page.id));
        if (!evidence.inspectedPageIds.some((id) => pageIds.has(id))) {
          throw new Error("visual-review-invalid: inspectedPageIds do not include a page on the current board");
        }
        if (evidence.phase === "final" && !pages2.every((page) => evidence.inspectedPageIds.includes(page.id))) {
          throw new Error("visual-review-incomplete: final review must include every current page id");
        }
        const recorded = await store.recordBoardReview(args.root, {
          token: reviewToken,
          board: target2.name,
          boardRevision: board2.value.rev,
          phase: evidence.phase,
          inspectedPageIds: evidence.inspectedPageIds,
          observations: evidence.observations
        });
        if (!recorded.ok) throw new Error(`${recorded.error.code}: ${recorded.error.message}`);
        const prototypeQuality2 = inspectPrototypeQuality(board2.value.scene.elements);
        const completionReady2 = evidence.phase === "final" && prototypeQuality2.structurePassed && prototypeQuality2.contentPassed && prototypeQuality2.layoutPassed && prototypeQuality2.warnings.length === 0;
        prototypeQuality2.visualReviewRequired = !completionReady2 && pages2.length > 0;
        const pendingWrite = evidence.phase === "representative" ? pendingReviewWriteFor(args.root, target2.name, board2.value.rev) : null;
        const nextActionCode2 = completionReady2 ? "complete" : evidence.phase === "representative" ? pendingWrite === null ? "write_remaining_pages" : "commit_pending_write" : "fix_layout";
        const nextAction2 = completionReady2 ? "\u89C6\u89C9\u590D\u6838\u5DF2\u8986\u76D6\u5168\u90E8\u9875\u9762\uFF0C\u4E14\u7ED3\u6784\u3001\u5185\u5BB9\u548C\u5E03\u5C40\u95E8\u7981\u5168\u90E8\u901A\u8FC7" : evidence.phase === "representative" ? pendingWrite === null ? "\u4EE3\u8868\u9875\u590D\u6838\u5DF2\u8BB0\u5F55\uFF1B\u53EF\u4EE5\u5199\u5165\u5176\u4F59\u9875\u9762\uFF0C\u4E0D\u9700\u8981\u518D\u6B21\u4F20\u9012\u65E7 revision \u6216 revealRequestId" : "\u4EE3\u8868\u9875\u590D\u6838\u5DF2\u8BB0\u5F55\uFF1B\u6B64\u524D\u63D0\u4EA4\u7684\u5269\u4F59\u9875\u9762 ops \u5DF2\u4FDD\u7559\uFF0C\u8BF7\u7528 action=commit_pending \u548C pendingUpdateId \u63D0\u4EA4\uFF0C\u4E0D\u8981\u91CD\u53D1\u5927 JSON" : "\u6700\u7EC8\u590D\u6838\u5DF2\u8BB0\u5F55\uFF0C\u4F46\u4ECD\u9700\u5148\u4FEE\u590D prototypeQuality.warnings\uFF0C\u518D\u91CD\u65B0\u67E5\u770B\u6700\u65B0\u753B\u677F";
        const active = await store.getActiveBoard(args.root);
        if (!active.ok) throw new Error(`${active.error.code}: ${active.error.message}`);
        return {
          rev: board2.value.rev,
          targetBoard: target2.name,
          ...active.value.name === null ? {} : { activeBoard: active.value.name },
          elementCount: board2.value.scene.elements.length,
          applied: 0,
          verified: true,
          writeVerified: false,
          reviewVerified: true,
          completionReady: completionReady2,
          nextAction: nextAction2,
          nextActionCode: nextActionCode2,
          capacity: measureSceneCapacity(board2.value.scene),
          prototypeQuality: prototypeQuality2,
          revealRequestId: reviewToken,
          reviewToken,
          reviewRequest: {
            token: reviewToken,
            boardRevision: board2.value.rev,
            phase: evidence.phase,
            pageIds: evidence.inspectedPageIds
          },
          ...pendingWrite === null ? {} : { pendingUpdateId: pendingWrite.id },
          layoutWarnings: layoutWarnings(board2.value.scene.elements),
          requiresConfirmation: false,
          pending: false,
          timings: timings()
        };
      }
      if (requestedAction === "write" && args.ops === void 0) throw new Error("invalid arguments: action=write requires ops");
      if (visualReview?.phase === "final" && parsedOps.length > 0) {
        throw new Error("visual-review-final-requires-empty-ops: final visualReview must be submitted after all writes in a separate call with ops=[]");
      }
      const target = await resolveBoard(store, args.root, targetName);
      const readStartedAt = performance.now();
      const board = await store.read(args.root, target.name);
      stageTimings.readMs += performance.now() - readStartedAt;
      if (pendingCommit !== null && (!board.ok || Math.abs(board.value.rev - pendingCommit.baseRev) > 0.5)) {
        throw new Error("pending-update-stale: board changed after the pending batch was preserved; read the latest board and create a new minimal update");
      }
      await validateVisualReviewEvidence(store, args.root, target.name, board.ok ? board.value.rev : null, visualReview);
      const key = makeKey(args.root, target.name);
      const cache = boardCache.get(key);
      const currentElements = board.ok ? board.value.scene.elements : [];
      const preflightStartedAt = performance.now();
      rejectNewPrototypeFrames(currentElements, parsedOps);
      const frameNormalizedOps = normalizeFrameLocalCoordinates(currentElements, parsedOps);
      const semanticOps = normalizeSemanticUpserts(currentElements, frameNormalizedOps);
      const ops = normalizePageShellUpserts(currentElements, semanticOps);
      const prospectiveElements = previewElements(currentElements, ops);
      const currentScene = board.ok ? board.value.scene : { elements: [] };
      const currentCapacity = measureSceneCapacity(currentScene);
      const projectedCapacity = measureSceneCapacity({ ...currentScene, elements: prospectiveElements });
      if (projectedCapacity.usedBytes > projectedCapacity.maxBytes) {
        stageTimings.preflightMs += performance.now() - preflightStartedAt;
        const prototypeQuality2 = inspectPrototypeQuality(currentElements);
        return {
          rev: board.ok ? board.value.rev : 0,
          targetBoard: target.name,
          ...target.activeBoard === void 0 ? {} : { activeBoard: target.activeBoard },
          elementCount: currentElements.length,
          applied: 0,
          verified: false,
          writeVerified: false,
          reviewVerified: false,
          completionReady: false,
          nextAction: "\u672C\u6279\u6B21\u4F1A\u8D85\u8FC7\u753B\u677F\u5BB9\u91CF\uFF1B\u4FDD\u7559\u5F53\u524D\u753B\u677F\u4E0D\u5199\u5165\uFF0C\u5C06\u66F4\u65B0\u62C6\u6210\u66F4\u5C0F\u7684\u72EC\u7ACB\u6279\u6B21\u540E\u91CD\u8BD5",
          nextActionCode: "reduce_update_scope",
          nextActionParams: {
            tool: "draw2code_update",
            arguments: { root: args.root, name: target.name, action: "write", ops: "<smaller independent batch>" }
          },
          capacity: {
            maxBytes: projectedCapacity.maxBytes,
            usedBytes: currentCapacity.usedBytes,
            remainingBytes: currentCapacity.remainingBytes,
            projectedBytes: projectedCapacity.usedBytes,
            excessBytes: projectedCapacity.usedBytes - projectedCapacity.maxBytes
          },
          timings: timings(),
          prototypeQuality: prototypeQuality2,
          layoutWarnings: layoutWarnings(currentElements),
          requiresConfirmation: false,
          pending: false
        };
      }
      const storedRepresentative = await store.getBoardReview(args.root, target.name, "representative");
      if (!storedRepresentative.ok) throw new Error(`${storedRepresentative.error.code}: ${storedRepresentative.error.message}`);
      const storedRepresentativeReviewed = board.ok && storedRepresentative.value.receipt !== null && Math.abs(storedRepresentative.value.receipt.revision - board.value.rev) <= 0.5 && storedRepresentative.value.receipt.inspectedPageIds.some((id) => prototypePages(currentElements).some((page) => page.id === id));
      try {
        validatePhasedDrawing(currentElements, prospectiveElements, visualReview, storedRepresentativeReviewed);
      } catch (error2) {
        const message = error2 instanceof Error ? error2.message : String(error2);
        const currentPages = prototypePages(currentElements);
        if (!message.startsWith("visual-review-required:") || currentPages.length === 0 || !board.ok || requestedAction !== "write") throw error2;
        const pendingWrite = rememberPendingReviewWrite({
          root: args.root,
          board: target.name,
          baseRev: board.value.rev,
          ops
        });
        const reveal = await store.getBoardReveal(args.root);
        if (!reveal.ok) throw new Error(`${reveal.error.code}: ${reveal.error.message}`);
        const request = reveal.value.request;
        if (request === null || request.board !== target.name || Math.abs(request.revision - board.value.rev) > 0.5) {
          pendingReviewWrites.delete(pendingWrite.id);
          throw error2;
        }
        stageTimings.preflightMs += performance.now() - preflightStartedAt;
        const prototypeQuality2 = inspectPrototypeQuality(currentElements);
        prototypeQuality2.visualReviewRequired = true;
        return {
          rev: board.value.rev,
          targetBoard: target.name,
          ...target.activeBoard === void 0 ? {} : { activeBoard: target.activeBoard },
          elementCount: currentElements.length,
          applied: 0,
          verified: false,
          writeVerified: false,
          reviewVerified: false,
          completionReady: false,
          nextAction: "\u5269\u4F59\u9875\u9762 ops \u5DF2\u5B89\u5168\u6682\u5B58\uFF1B\u5148\u67E5\u770B\u5F53\u524D\u4EE3\u8868\u9875\u5E76\u7528 action=review\u3001reviewToken \u548C phase=representative \u5B8C\u6210\u590D\u6838\uFF0C\u4E4B\u540E\u53EA\u63D0\u4EA4 pendingUpdateId\uFF0C\u4E0D\u8981\u91CD\u53D1\u5927 JSON",
          nextActionCode: "review_representative",
          nextActionParams: {
            tool: "draw2code_update",
            arguments: { root: args.root, name: target.name, action: "review", reviewToken: request.id, phase: "representative" }
          },
          capacity: currentCapacity,
          timings: timings(),
          prototypeQuality: prototypeQuality2,
          revealRequestId: request.id,
          reviewToken: request.id,
          reviewRequest: {
            token: request.id,
            boardRevision: board.value.rev,
            phase: "representative",
            pageIds: currentPages.map((page) => page.id)
          },
          pendingUpdateId: pendingWrite.id,
          layoutWarnings: layoutWarnings(currentElements),
          requiresConfirmation: false,
          pending: false
        };
      }
      validateNewPrototypePageContracts(currentElements, prospectiveElements);
      const layoutReport = inspectPrototypeLayout(prospectiveElements, {
        focusIds: layoutFocusIdsWithPages(ops, currentElements, prospectiveElements)
      });
      if (layoutReport.errors.length > 0) {
        throw new Error(`layout-invalid:
${formatLayoutIssues(layoutReport.errors)}
\u8BF7\u4FEE\u6B63\u7EC4\u4EF6\u51E0\u4F55\u548C\u5185\u5BB9\u53EF\u8BFB\u6027\u540E\u518D\u8C03\u7528 draw2code_update\uFF1B\u4E0D\u8981\u628A\u591A\u884C\u5185\u5BB9\u538B\u8FDB\u5355\u884C text\u3001\u4E0D\u8981\u628A\u6309\u94AE\u6587\u6848\u5199\u8FDB rectangle.text\uFF0C\u4E5F\u4E0D\u8981\u7528\u7A7A\u767D\u65B9\u6846\u4EE3\u66FF mock \u6570\u636E\u3002`);
      }
      const hasSnapshot = cache !== void 0;
      const userChanges = cache !== void 0 ? diffSummaries(cache.elements, currentElements) : { added: [], removed: [], modified: [] };
      const userChangeIds = hasSnapshot ? computeChangeIds(cache.elements, currentElements) : null;
      const touchedManualIds = touchedByManualChange(userChangeIds);
      const plannedChanges = summarizePlan(ops, currentElements);
      const conflicts = board.ok ? buildUpdatePlan(currentElements, ops, safeMode, touchedManualIds, hasSnapshot) : [];
      const finalPlanSummary = buildPlanMessage(userChanges, plannedChanges, conflicts);
      if (board.ok) {
        rememberSnapshot(key, { rev: board.value.rev, elements: currentElements });
      }
      if (!board.ok && !force && board.error.code !== "not-found") {
        throw new Error(`${board.error.code}: ${board.error.message}`);
      }
      if (safeMode && !force && conflicts.length > 0) {
        stageTimings.preflightMs += performance.now() - preflightStartedAt;
        const elementCount = currentElements.length;
        const conflictValues = conflicts;
        const prototypeQuality2 = inspectPrototypeQuality(currentElements);
        return {
          rev: board.ok ? board.value.rev : 0,
          targetBoard: target.name,
          ...target.activeBoard !== void 0 ? { activeBoard: target.activeBoard } : {},
          elementCount,
          applied: 0,
          verified: false,
          writeVerified: false,
          completionReady: false,
          nextAction: "\u5148\u786E\u8BA4\u51B2\u7A81\uFF1B\u672C\u8F6E\u5C1A\u672A\u5199\u5165\uFF0C\u4E5F\u4E0D\u80FD\u8FDB\u5165\u89C6\u89C9\u5B8C\u6210\u9A8C\u6536",
          nextActionCode: "confirm_overwrite",
          nextActionParams: {
            tool: "draw2code_update",
            arguments: { root: args.root, name: target.name, action: "write", force: true }
          },
          capacity: currentCapacity,
          timings: timings(),
          prototypeQuality: prototypeQuality2,
          layoutWarnings: layoutWarnings(currentElements),
          requiresConfirmation: true,
          pending: true,
          conflicts: conflictValues,
          userSummary: finalPlanSummary,
          planSummary: finalPlanSummary,
          summary: {
            userChanges,
            plannedChanges
          }
        };
      }
      stageTimings.preflightMs += performance.now() - preflightStartedAt;
      const writeStartedAt = performance.now();
      const result = await store.applyOps(args.root, target.name, ops, board.ok ? board.value.rev : void 0);
      stageTimings.writeMs += performance.now() - writeStartedAt;
      if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
      firstEffectiveWriteAt = performance.now();
      const verificationStartedAt = performance.now();
      const refreshed = await store.read(args.root, target.name);
      if (!refreshed.ok) throw new Error(`${refreshed.error.code}: ${refreshed.error.message}`);
      if (refreshed.value.scene.elements.length !== result.value.elementCount) {
        throw new Error("draw2code_update write verification failed: element count changed before read-back");
      }
      const verificationError = verifyAppliedOps(ops, refreshed.value.scene.elements);
      if (verificationError !== null) throw new Error(`draw2code_update write verification failed: ${verificationError}`);
      stageTimings.verificationMs += performance.now() - verificationStartedAt;
      if (pendingCommit !== null) pendingReviewWrites.delete(pendingCommit.id);
      rememberSnapshot(key, { rev: refreshed.value.rev, elements: refreshed.value.scene.elements });
      const publishStartedAt = performance.now();
      const selected = await store.setActiveBoard(args.root, target.name);
      if (!selected.ok) throw new Error(`draw2code_update verified but could not select its board: ${selected.error.code}: ${selected.error.message}`);
      const revealed = await store.publishBoardReveal(args.root, target.name, refreshed.value.rev);
      if (!revealed.ok) throw new Error(`draw2code_update verified but could not queue its board reveal: ${revealed.error.code}: ${revealed.error.message}`);
      stageTimings.publishMs += performance.now() - publishStartedAt;
      const qualityWarnings = layoutWarnings(refreshed.value.scene.elements);
      const pages = prototypePages(refreshed.value.scene.elements);
      const prototypeQuality = inspectPrototypeQuality(refreshed.value.scene.elements);
      const completionReady = ops.length === 0 && reviewedEveryPage(visualReview, pages) && prototypeQuality.structurePassed && prototypeQuality.contentPassed && prototypeQuality.layoutPassed && prototypeQuality.warnings.length === 0;
      prototypeQuality.visualReviewRequired = !completionReady && pages.length > 0;
      const nextActionCode = completionReady ? "complete" : pages.length === 0 ? "write_representative" : !prototypeQuality.structurePassed || !prototypeQuality.contentPassed || !prototypeQuality.layoutPassed || prototypeQuality.warnings.length > 0 ? "fix_layout" : pages.length >= 3 ? "review_final" : "review_visible_board";
      const nextAction = completionReady ? "\u89C6\u89C9\u590D\u6838\u5DF2\u8986\u76D6\u5168\u90E8\u9875\u9762\uFF1B\u53EF\u4EE5\u6839\u636E prototypeQuality \u7684\u5269\u4F59 warnings \u51B3\u5B9A\u662F\u5426\u7EE7\u7EED\u6253\u78E8" : pages.length === 0 ? "\u5F53\u524D\u753B\u677F\u6CA1\u6709\u53EF\u8BC6\u522B\u9875\u9762\uFF1B\u5148\u521B\u5EFA prototype-page" : !prototypeQuality.structurePassed || !prototypeQuality.contentPassed || !prototypeQuality.layoutPassed || prototypeQuality.warnings.length > 0 ? "\u5148\u6309 prototypeQuality.warnings \u4FEE\u590D\u7ED3\u6784\u3001\u9996\u5C4F\u5185\u5BB9\u548C\u5E03\u5C40\uFF1B\u5168\u90E8\u901A\u8FC7\u540E\u5728\u771F\u5B9E\u753B\u677F\u9010\u9875\u68C0\u67E5\uFF0C\u518D\u7528 action=review \u548C\u6700\u65B0 reviewToken \u63D0\u4EA4 phase=final" : ops.length > 0 && visualReview?.phase === "final" ? "\u672C\u8F6E\u4ECD\u5199\u5165\u4E86\u5143\u7D20\uFF0C\u4E0D\u80FD\u540C\u65F6\u8BC1\u660E\u5199\u5165\u540E\u7684\u89C6\u89C9\u7ED3\u679C\uFF1B\u8BF7\u67E5\u770B\u771F\u5B9E\u753B\u677F\u540E\uFF0C\u7528 action=review \u548C\u6700\u65B0 reviewToken \u5355\u72EC\u63D0\u4EA4 phase=final" : "\u5728\u771F\u5B9E\u53EF\u89C1\u753B\u677F\u9010\u9875\u505A\u89C6\u89C9\u68C0\u67E5\uFF1A\u9996\u5C4F\u4EFB\u52A1\u3001\u5C42\u7EA7\u3001\u5BF9\u9F50\u3001mock \u6570\u636E\u548C\u5BFC\u822A\uFF1B\u518D\u7528 action=review\u3001\u6700\u65B0 reviewToken \u548C\u8986\u76D6\u5168\u90E8 page id \u7684 phase=final \u6536\u53E3";
      return {
        rev: result.value.rev,
        targetBoard: target.name,
        activeBoard: selected.value.name,
        elementCount: result.value.elementCount,
        applied: result.value.applied,
        verified: true,
        writeVerified: true,
        reviewVerified: false,
        completionReady,
        nextAction,
        nextActionCode,
        capacity: measureSceneCapacity(refreshed.value.scene),
        timings: timings(),
        prototypeQuality,
        revealRequestId: revealed.value.id,
        reviewToken: revealed.value.id,
        reviewRequest: {
          token: revealed.value.id,
          boardRevision: refreshed.value.rev,
          pageIds: pages.map((page) => page.id)
        },
        layoutWarnings: qualityWarnings,
        requiresConfirmation: false,
        pending: false,
        userSummary: finalPlanSummary,
        planSummary: finalPlanSummary,
        summary: {
          userChanges,
          plannedChanges
        }
      };
    }
  });
}
function visualBriefFor(direction, device, frameNames) {
  const mobile = device === "mobile" || device === "\u79FB\u52A8\u7AEF H5";
  const focalPage = frameNames[0] ?? "\u6838\u5FC3\u9875\u9762";
  const darkTech = /未来|科技|深色|赛博/iu.test(direction);
  const warm = /温暖|友好|生活|亲切|轻松/iu.test(direction);
  const professional = /专业|数据|稳重|效率/iu.test(direction);
  const bold = /大胆|鲜明|活力|年轻/iu.test(direction);
  return {
    direction,
    tone: darkTech ? "\u6C89\u6D78\u3001\u7CBE\u786E\u3001\u6709\u660E\u786E\u9AD8\u4EAE\u7126\u70B9\uFF0C\u907F\u514D\u628A\u6240\u6709\u533A\u57DF\u90FD\u505A\u6210\u53D1\u5149\u9762\u677F" : warm ? "\u4EB2\u5207\u3001\u677E\u5F1B\u3001\u53EF\u4FE1\uFF0C\u4F7F\u7528\u514B\u5236\u88C5\u9970\u4FDD\u6301\u4EFB\u52A1\u6E05\u6670" : professional ? "\u9AD8\u6548\u3001\u53EF\u9760\u3001\u5C42\u7EA7\u6E05\u695A\uFF0C\u6570\u636E\u4E0E\u72B6\u6001\u4F18\u5148" : bold ? "\u8F7B\u5FEB\u3001\u4E3B\u52A8\u3001\u6709\u8BC6\u522B\u5EA6\uFF0C\u4EE5\u5C11\u91CF\u9AD8\u5BF9\u6BD4\u7126\u70B9\u5E26\u52A8\u9875\u9762" : "\u514B\u5236\u3001\u6E05\u6670\u3001\u6709\u660E\u786E\u89C6\u89C9\u91CD\u5FC3\uFF0C\u907F\u514D\u901A\u7528\u6A21\u677F\u611F",
    background: darkTech ? "\u6DF1\u8272\u4F4E\u566A\u58F0\u5E95\u8272\uFF0C\u5185\u5BB9\u533A\u4FDD\u6301\u8DB3\u591F\u5BF9\u6BD4\u5EA6" : "\u4F4E\u9971\u548C\u4E2D\u6027\u5E95\u8272\uFF0C\u5361\u7247\u4E0E\u4E3B\u5185\u5BB9\u5F62\u6210\u6E05\u695A\u5C42\u6B21",
    primaryAction: bold || darkTech ? "\u4E3B\u64CD\u4F5C\u4F7F\u7528\u5355\u4E00\u9AD8\u5BF9\u6BD4\u5F3A\u8C03\u8272\uFF0C\u6BCF\u9875\u53EA\u7A81\u51FA\u4E00\u4E2A\u9996\u8981\u52A8\u4F5C" : "\u4E3B\u64CD\u4F5C\u4F7F\u7528\u7A33\u5B9A\u5F3A\u8C03\u8272\uFF0C\u6B21\u8981\u64CD\u4F5C\u964D\u4F4E\u5BF9\u6BD4\u5EA6",
    semanticColors: "\u6210\u529F\u3001\u63D0\u9192\u3001\u5371\u9669\u3001\u4FE1\u606F\u72B6\u6001\u4F7F\u7528\u53EF\u533A\u5206\u7684\u8BED\u4E49\u8272\uFF1B\u4E0D\u80FD\u7528\u54C1\u724C\u8272\u4EE3\u66FF\u5168\u90E8\u72B6\u6001",
    density: professional ? "\u4FE1\u606F\u5BC6\u5EA6\u9002\u4E2D\u504F\u7D27\u51D1\uFF0C\u4F46\u4FDD\u8BC1\u89E6\u63A7\u9762\u79EF\u548C\u626B\u8BFB\u95F4\u8DDD" : "\u4FDD\u6301\u8212\u9002\u7559\u767D\uFF0C\u76F8\u5173\u5185\u5BB9\u7D27\u51D1\u6210\u7EC4\uFF0C\u4E0D\u5E73\u5747\u5206\u914D\u7A7A\u95F4",
    typeHierarchy: "\u81F3\u5C11\u5EFA\u7ACB\u9875\u9762\u6807\u9898\u3001\u533A\u5757\u6807\u9898\u3001\u6B63\u6587\u3001\u8F85\u52A9\u4FE1\u606F\u56DB\u7EA7\u5C42\u6B21\uFF0C\u7981\u6B62\u6240\u6709\u6587\u5B57\u540C\u5B57\u53F7\u540C\u5B57\u91CD",
    layoutStrategy: mobile ? "\u4EE5\u5185\u5BB9\u6D41\u3001CSS Grid/Flex \u548C\u54CD\u5E94\u5F0F\u7EA6\u675F\u91CD\u6392\uFF1B\u9002\u914D 320\u2013430px \u624B\u673A\u5BBD\u5EA6\uFF0C\u4E0D\u590D\u5236\u539F\u578B\u7EDD\u5BF9\u5750\u6807" : "\u4EE5\u5185\u5BB9\u6D41\u3001CSS Grid/Flex \u548C\u5BB9\u5668\u7EA6\u675F\u91CD\u6392\uFF1B\u968F\u89C6\u53E3\u54CD\u5E94\uFF0C\u4E0D\u590D\u5236\u539F\u578B\u7EDD\u5BF9\u5750\u6807",
    motion: "\u53EA\u4E3A\u9875\u9762\u5207\u6362\u3001\u72B6\u6001\u53D8\u5316\u548C\u64CD\u4F5C\u53CD\u9988\u4F7F\u7528\u77ED\u52A8\u6548\uFF0C\u5C0A\u91CD prefers-reduced-motion",
    focalPoint: "\u8BA9\u7528\u6237\u9996\u5148\u770B\u5230\u300C" + focalPage + "\u300D\u7684\u6838\u5FC3\u4EFB\u52A1\u6216\u5173\u952E\u72B6\u6001\uFF0C\u800C\u4E0D\u662F\u540C\u65F6\u5F3A\u8C03\u6240\u6709\u7EC4\u4EF6"
  };
}
function buildGenerateInstructions(board, frameNames, existingPages, visualBrief, referenceStyle) {
  const lines = [
    "\u6309\u4EE5\u4E0B\u8981\u6C42\u751F\u6210\u524D\u7AEF\u9875\u9762\uFF1A",
    "1. \u753B\u677F\u539F\u578B\u662F\u4EA7\u54C1\u4E8B\u5B9E\u6765\u6E90\uFF1A\u5FC5\u987B\u4FDD\u7559" + (frameNames.length > 0 ? "\u300C" + frameNames.join("\u300D\u300C") + "\u300D\u8FD9\u4E9B\u8303\u56F4\u7684" : "\u6574\u5757\u753B\u677F\u7684") + "\u9875\u9762\u3001\u4FE1\u606F\u5C42\u7EA7\u3001\u6587\u6848\u3001mock \u6570\u636E\u3001\u7EC4\u4EF6\u8BED\u4E49\u548C\u4EA4\u4E92\u5173\u7CFB\uFF1B\u7981\u6B62\u6DFB\u52A0\u539F\u578B\u4E2D\u4E0D\u5B58\u5728\u7684\u6A21\u5757\u3001\u9875\u9762\u3001\u89D2\u8272\u3001\u6D41\u7A0B\u6216\u91CD\u5927\u4E1A\u52A1\u89C4\u5219\u3002",
    "2. \u539F\u578B\u4E0D\u662F\u50CF\u7D20\u6A21\u677F\u3002\u7981\u6B62\u7167\u642C Excalidraw \u7684\u7EDD\u5BF9\u5750\u6807\u3001\u65B9\u6846\u5C3A\u5BF8\u548C\u4F4E\u4FDD\u771F\u7A7A\u767D\uFF1B\u4F7F\u7528\u8BED\u4E49\u5316 HTML\u3001\u5185\u5BB9\u6D41\u3001CSS Grid\u3001Flex \u548C\u5BB9\u5668\u7EA6\u675F\u91CD\u65B0\u6392\u7248\u3002absolute/fixed \u53EA\u7528\u4E8E\u786E\u6709\u5FC5\u8981\u7684\u6D6E\u5C42\u3001\u88C5\u9970\u6216\u56FA\u5B9A\u5BFC\u822A\u3002",
    "3. \u82E5\u539F\u578B\u662F\u79FB\u52A8\u7AEF\u5E03\u5C40\uFF0C\u751F\u6210 H5 \u9875\u9762\u672C\u4F53\uFF0C\u4E0D\u8981\u5957\u624B\u673A\u8FB9\u6846\uFF1B\u81F3\u5C11\u9002\u914D 320\u2013430px \u624B\u673A\u5BBD\u5EA6\uFF0C\u5E76\u4FDD\u8BC1\u684C\u9762\u9884\u89C8\u65F6\u5185\u5BB9\u7A33\u5B9A\u5C45\u4E2D\u3001\u65E0\u6A2A\u5411\u6EA2\u51FA\u3002",
    "4. \u8F93\u51FA\u5230 draw2code-pages/" + board + "/index.html\uFF1A\u5355\u6587\u4EF6\u3001\u5185\u8054 CSS/JS\u3001\u53EF\u76F4\u63A5\u5728\u6D4F\u89C8\u5668\u6253\u5F00\uFF1B\u591A\u4E2A\u9875\u9762\u653E\u5728\u540C\u4E00\u6587\u4EF6\u5185\u5E76\u4E92\u76F8\u5BFC\u822A\u3002\u6BCF\u4E2A\u9875\u9762\u6839\u8282\u70B9\u524D\u540E\u5FC5\u987B\u4FDD\u7559 <!-- d2c-page:<\u9875\u9762\u539F\u540D>:start --> \u548C <!-- d2c-page:<\u9875\u9762\u539F\u540D>:end -->\uFF0C\u4F9B\u540E\u7EED\u91CD\u65B0\u751F\u6210\u65F6\u7CBE\u786E\u4FDD\u62A4\u672A\u9009\u9875\u9762\u3002",
    existingPages.length > 0 ? "5. draw2code-pages/" + board + "/ \u5DF2\u6709\u9875\u9762\uFF08" + existingPages.join("\u3001") + "\uFF09\uFF1A\u5148\u8BFB\u53D6\u73B0\u6709 index.html\uFF0C\u6CBF\u7528\u5176\u6280\u672F\u5B9E\u73B0\uFF0C\u53EA\u66F4\u65B0\u672C\u6B21\u8303\u56F4\u5185\u7684\u9875\u9762\uFF0C\u4FDD\u6301\u5176\u4F59\u9875\u9762\u4E0D\u53D8\u3002" : "5. draw2code-pages/" + board + "/ \u76EE\u524D\u4E3A\u7A7A\uFF1A\u4ECE\u96F6\u751F\u6210\uFF0C\u4F46\u4E0D\u80FD\u9000\u5316\u6210\u65E0\u5C42\u7EA7\u7684\u901A\u7528\u6A21\u677F\u3002",
    "6. \u4F7F\u7528\u4EE5\u4E0B\u7ED3\u6784\u5316\u89C6\u89C9\u7B80\u62A5\uFF0C\u800C\u4E0D\u662F\u53EA\u628A\u201C" + visualBrief.direction + "\u201D\u5F53\u4F5C\u7A7A\u6CDB\u5F62\u5BB9\u8BCD\uFF1A\n   - \u6C14\u8D28\uFF1A" + visualBrief.tone + "\n   - \u80CC\u666F\uFF1A" + visualBrief.background + "\n   - \u4E3B\u64CD\u4F5C\uFF1A" + visualBrief.primaryAction + "\n   - \u8BED\u4E49\u8272\uFF1A" + visualBrief.semanticColors + "\n   - \u5BC6\u5EA6\uFF1A" + visualBrief.density + "\n   - \u5B57\u4F53\u5C42\u7EA7\uFF1A" + visualBrief.typeHierarchy + "\n   - \u5E03\u5C40\u7B56\u7565\uFF1A" + visualBrief.layoutStrategy + "\n   - \u52A8\u6548\uFF1A" + visualBrief.motion + "\n   - \u89C6\u89C9\u7126\u70B9\uFF1A" + visualBrief.focalPoint,
    "7. \u9075\u5FAA\u4E13\u4E1A\u524D\u7AEF\u8BBE\u8BA1\u89C4\u8303\uFF1A\u5148\u5EFA\u7ACB CSS \u8BBE\u8BA1\u53D8\u91CF\uFF1B\u6BCF\u9875\u53EA\u7A81\u51FA\u4E00\u4E2A\u4E3B\u8981\u4EFB\u52A1\uFF1B\u907F\u514D\u65E0\u76EE\u7684\u6E10\u53D8\u3001\u8FC7\u5EA6\u5706\u89D2\u3001\u5E73\u5747\u7528\u529B\u548C\u5343\u7BC7\u4E00\u5F8B\u7684 AI \u6A21\u677F\u611F\uFF1B\u771F\u5B9E mock \u6570\u636E\u5FC5\u987B\u53C2\u4E0E\u6392\u7248\u3002",
    referenceStyle === null ? "8. \u7528\u6237\u672C\u6B21\u672A\u63D0\u4F9B\u53C2\u8003\u98CE\u683C\u56FE\uFF1B\u4EE5\u7ED3\u6784\u5316\u89C6\u89C9\u7B80\u62A5\u4E3A\u51C6\uFF0C\u4E0D\u5F97\u9000\u5316\u4E3A\u65E0\u5DEE\u522B\u7684\u901A\u7528\u6A21\u677F\u3002" : "8. \u7528\u6237\u63D0\u4F9B\u7684\u53C2\u8003\u98CE\u683C\u4FE1\u606F\u662F\uFF1A" + referenceStyle + "\u3002\u63D0\u53D6\u5176\u914D\u8272\u5173\u7CFB\u3001\u5B57\u4F53\u611F\u89C9\u3001\u7559\u767D\u3001\u5E03\u5C40\u5BC6\u5EA6\u548C\u7EC4\u4EF6\u6C14\u8D28\uFF0C\u4F46\u9875\u9762\u5185\u5BB9\u4E0E\u6D41\u7A0B\u4ECD\u4EE5\u753B\u677F\u539F\u578B\u4E3A\u51C6\uFF0C\u7981\u6B62\u50CF\u7D20\u7167\u6284\u3002",
    "9. \u53EF\u4EE5\u8865\u5145\u5FC5\u586B\u6821\u9A8C\u3001\u52A0\u8F7D\u3001\u6210\u529F\u63D0\u793A\u548C\u9009\u4E2D\u6001\u7B49\u901A\u7528\u4EA4\u4E92\u53CD\u9988\uFF0C\u4F46\u4E0D\u5F97\u65B0\u589E\u4EA7\u54C1\u4E8B\u5B9E\u3002",
    "10. \u5199\u5165\u540E\u5FC5\u987B\u81EA\u52A8\u6253\u5F00\u771F\u5B9E\u6D4F\u89C8\u5668\u9884\u89C8\uFF0C\u9010\u9875\u622A\u56FE\u5E76\u5B9E\u9645\u9A8C\u8BC1\uFF1A\u6240\u9009\u9875\u9762\u548C mock \u6570\u636E\u53EF\u89C1\u3001\u9875\u9762\u5207\u6362\u4E0E\u6838\u5FC3\u6309\u94AE\u53EF\u7528\u3001\u6838\u5FC3\u6D41\u7A0B\u8D70\u901A\u3001\u63A7\u5236\u53F0\u65E0 error/warning\u3001\u65E0\u6A2A\u5411\u6EA2\u51FA\u6216\u5185\u5BB9\u88C1\u5207\u3001\u6309\u94AE\u6587\u6848\u5C45\u4E2D\u3001\u5E95\u90E8\u5BFC\u822A\u5B8C\u6574\u3002\u53D1\u73B0\u5B9E\u73B0\u95EE\u9898\u8981\u76F4\u63A5\u4FEE\u590D\u5E76\u91CD\u65B0\u9A8C\u8BC1\u3002",
    "11. \u8C03\u7528 action=complete \u65F6\u5FC5\u987B\u63D0\u4EA4 verificationEvidence\uFF1A\u672C\u6B21\u6D4F\u89C8\u5668\u9A8C\u6536\u552F\u4E00 captureId\u3001\u751F\u6210\u5165\u53E3 outputSha256\u3001previewUrl\u3001viewports\uFF1B\u8986\u76D6\u6BCF\u4E2A\u6240\u9009\u9875\u9762\u7684 screenshots[{page,viewport,source,sha256,captureId}]\uFF1B\u6D4F\u89C8\u5668\u5BFC\u51FA\u7684 domSnapshots[{page,source,sha256,captureId}]\uFF1BconsoleErrors\u3001consoleWarnings\u3001domChecks\u3001layoutChecks \u548C interactionChecks\u3002previewUrl \u5185\u5BB9\u54C8\u5E0C\u5FC5\u987B\u7B49\u4E8E outputSha256\uFF1B\u622A\u56FE\u548C DOM \u5FEB\u7167\u5FC5\u987B\u4FDD\u5B58\u5230 workspace \u5185\u3001\u5C5E\u4E8E\u540C\u4E00 captureId\uFF0Csha256 \u5FC5\u987B\u4E0E\u6587\u4EF6\u4E00\u81F4\uFF1B\u4E0D\u80FD\u518D\u7528\u51E0\u4E2A\u81EA\u62A5\u5E03\u5C14\u503C\u4EE3\u66FF\u8BC1\u636E\u3002",
    "12. \u53EA\u6709\u771F\u5B9E\u9884\u89C8\u8BC1\u636E\u901A\u8FC7\u5DE5\u5177\u95E8\u7981\u540E\uFF0C\u624D\u8C03\u7528 draw2code_generate action=complete\uFF1B\u5728 complete \u8FD4\u56DE completed \u4E4B\u524D\u4E0D\u5F97\u5411\u7528\u6237\u62A5\u544A\u751F\u6210\u5B8C\u6210\u3002"
  ];
  return lines.join("\n");
}
var REFERENCE_STYLE_PROMPT = "\u751F\u6210\u524D\u60F3\u786E\u8BA4\u4E00\u4E0B\uFF1A\u4F60\u6709\u6CA1\u6709\u53C2\u8003\u98CE\u683C\u7684\u56FE\u7247\uFF1F\u6709\u7684\u8BDD\u76F4\u63A5\u53D1\u56FE\u5373\u53EF\uFF1B\u6CA1\u6709\u4E5F\u6CA1\u5173\u7CFB\uFF0C\u6211\u4F1A\u7ED3\u5408\u539F\u578B\u667A\u80FD\u63A8\u8350\u89C6\u89C9\u65B9\u5411\u3002";
function normalizeReferenceStyle(value) {
  const normalized = value.trim();
  return /^(?:none|no|没有|无|不需要|暂无)$/iu.test(normalized) ? null : normalized;
}
function generateError(code, message, draft) {
  return {
    status: "error",
    error: { code, message, recoverable: code !== "invalid-action" },
    ...draft === void 0 ? {} : {
      sessionId: draft.sessionId,
      revision: draft.revision,
      board: draft.board
    }
  };
}
function pageScopeQuestion(pages, recommended, recommendationReasons = /* @__PURE__ */ new Map()) {
  const recommendedSet = new Set(recommended);
  const orderedPages = [...pages].sort((left, right) => {
    const leftRecommended = recommendedSet.has(left.name) ? 0 : 1;
    const rightRecommended = recommendedSet.has(right.name) ? 0 : 1;
    return leftRecommended - rightRecommended;
  });
  return {
    id: "page-scope",
    text: "\u8FD9\u6B21\u8981\u628A\u54EA\u4E9B\u539F\u578B\u9875\u9762\u751F\u6210\u6210\u53EF\u4F53\u9A8C\u7684\u524D\u7AEF Demo\uFF1F",
    selectionMode: "multiple",
    minSelections: 1,
    allowOther: false,
    options: orderedPages.map((page) => {
      const name = page.name;
      const isRecommended = recommendedSet.has(name);
      const displayLabel = `${name}${isRecommended ? "\uFF08\u63A8\u8350\uFF09" : ""}`;
      return {
        id: displayLabel,
        label: displayLabel,
        valueLabel: name,
        description: isRecommended ? "\u5EFA\u8BAE\u7EB3\u5165\u672C\u6B21\u751F\u6210\u8303\u56F4\uFF1B\u5BBF\u4E3B\u6682\u4E0D\u652F\u6301\u81EA\u52A8\u9884\u52FE\u9009\uFF0C\u53EF\u76F4\u63A5\u53D6\u6D88\u6216\u6539\u9009" : "\u672C\u6B21\u53EF\u9009\u9875\u9762",
        ...isRecommended ? { recommended: true, reason: recommendationReasons.get(name) ?? "\u5F53\u524D\u753B\u677F\u6838\u5FC3\u6D41\u7A0B\u9875\u9762" } : {}
      };
    }),
    recommendedValues: recommended.map((name) => `${name}\uFF08\u63A8\u8350\uFF09`)
  };
}
function directlyConnectedPages(elements, requested) {
  if (requested.length === 0) return [];
  const relations = prototypePageRelations(elements);
  const connected = /* @__PURE__ */ new Set();
  for (const relation of relations) {
    if (requested.includes(relation.sourcePage) && !requested.includes(relation.targetPage)) connected.add(relation.targetPage);
    if (requested.includes(relation.targetPage) && !requested.includes(relation.sourcePage)) connected.add(relation.sourcePage);
  }
  return [...connected];
}
function inferDevice(pages) {
  let mobile = 0;
  let desktop = 0;
  for (const page of pages) {
    const width = page.bounds.width;
    const height = page.bounds.height;
    if (width <= 600 && height > width) mobile += 1;
    else if (width >= 760 || width > height * 1.15) desktop += 1;
  }
  if (mobile > 0 && desktop > 0) return "mixed";
  if (mobile > 0) return "mobile";
  if (desktop > 0) return "desktop";
  return "ambiguous";
}
function deviceQuestion() {
  return {
    id: "target-device",
    text: "\u6240\u9009\u9875\u9762\u540C\u65F6\u51FA\u73B0\u79FB\u52A8\u7AEF\u548C\u684C\u9762\u7AEF\u5C3A\u5BF8\uFF0C\u8FD9\u6B21\u4EE5\u54EA\u79CD\u7248\u672C\u4E3A\u4E3B\uFF1F",
    selectionMode: "single",
    minSelections: 1,
    allowOther: false,
    options: [
      { id: "mobile", label: "\u79FB\u52A8\u7AEF H5\uFF08\u63A8\u8350\uFF09", valueLabel: "\u79FB\u52A8\u7AEF H5", description: "\u4EE5\u624B\u673A\u9875\u9762\u4E3A\u4E3B\u751F\u6210", recommended: true, reason: "\u9002\u5408\u76F4\u63A5\u5728 DSH \u9884\u89C8\u4E2D\u4F53\u9A8C\u6838\u5FC3\u6D41\u7A0B" },
      { id: "desktop", label: "\u684C\u9762 Web", description: "\u4EE5\u684C\u9762\u9875\u9762\u4E3A\u4E3B\u751F\u6210" },
      { id: "separate", label: "\u5206\u522B\u751F\u6210", description: "\u5728\u540C\u4E00 HTML \u4E2D\u4FDD\u7559\u4E24\u5957\u539F\u578B\u5E03\u5C40" }
    ],
    recommendedValues: ["mobile"]
  };
}
function visualQuestion(elements, referenceStyle = null) {
  const corpus = elements.map((element) => `${str3(element.name)} ${str3(element.text)}`).join(" ");
  const social = /社交|雷达|好友|聊天|附近|碰一碰/u.test(corpus);
  const dataTool = /统计|日历|万年历|图表|清单|任务|管理/u.test(corpus);
  const options = social ? [
    { id: "young-vibrant", label: "\u5E74\u8F7B\u6D3B\u529B\uFF08\u63A8\u8350\uFF09", valueLabel: "\u5E74\u8F7B\u6D3B\u529B", description: "\u6E05\u723D\u9AD8\u5BF9\u6BD4\u3001\u8F7B\u91CF\u52A8\u6548\uFF0C\u5F3A\u8C03\u53D1\u73B0\u4E0E\u8FDE\u63A5", recommended: true, reason: "\u9002\u5408\u793E\u4EA4\u4EA7\u54C1\u7684\u63A2\u7D22\u4E0E\u4E92\u52A8\u6C1B\u56F4" },
    { id: "future-tech", label: "\u672A\u6765\u79D1\u6280", description: "\u6DF1\u8272\u80CC\u666F\u3001\u96F7\u8FBE\u5149\u6548\u4E0E\u9AD8\u4EAE\u72B6\u6001" },
    { id: "warm-authentic", label: "\u6E29\u6696\u771F\u5B9E", description: "\u67D4\u548C\u8272\u5F69\u4E0E\u4EBA\u7269\u5185\u5BB9\u4F18\u5148" },
    { id: "minimal-light", label: "\u6781\u7B80\u8F7B\u91CF", description: "\u51CF\u5C11\u88C5\u9970\uFF0C\u7A81\u51FA\u6838\u5FC3\u64CD\u4F5C" },
    { id: "custom", label: "\u81EA\u5B9A\u4E49", description: "\u8865\u5145\u4E00\u4E2A\u6574\u4F53\u89C6\u89C9\u65B9\u5411" }
  ] : dataTool ? [
    { id: "clean-modern", label: "\u7B80\u6D01\u73B0\u4EE3\uFF08\u63A8\u8350\uFF09", valueLabel: "\u7B80\u6D01\u73B0\u4EE3", description: "\u6E05\u6670\u5C42\u7EA7\u3001\u514B\u5236\u914D\u8272\u4E0E\u8212\u9002\u7559\u767D", recommended: true, reason: "\u9002\u5408\u5DE5\u5177\u7C7B\u4EA7\u54C1\u9AD8\u9891\u9605\u8BFB\u548C\u64CD\u4F5C" },
    { id: "professional-tool", label: "\u4E13\u4E1A\u5DE5\u5177", description: "\u7D27\u51D1\u5E03\u5C40\u3001\u660E\u786E\u6570\u636E\u5C42\u7EA7" },
    { id: "data-clear", label: "\u6570\u636E\u6E05\u6670", description: "\u5F3A\u5316\u56FE\u8868\u3001\u6570\u5B57\u4E0E\u72B6\u6001\u5BF9\u6BD4" },
    { id: "relaxed-life", label: "\u8F7B\u677E\u751F\u6D3B", description: "\u67D4\u548C\u8272\u5F69\u4E0E\u66F4\u4EB2\u5207\u7684\u7EC4\u4EF6\u8868\u8FBE" },
    { id: "custom", label: "\u81EA\u5B9A\u4E49", description: "\u8865\u5145\u4E00\u4E2A\u6574\u4F53\u89C6\u89C9\u65B9\u5411" }
  ] : [
    { id: "clean-modern", label: "\u7B80\u6D01\u73B0\u4EE3\uFF08\u63A8\u8350\uFF09", valueLabel: "\u7B80\u6D01\u73B0\u4EE3", description: "\u6E05\u6670\u5C42\u7EA7\u3001\u514B\u5236\u914D\u8272\u4E0E\u8212\u9002\u7559\u767D", recommended: true, reason: "\u5BF9\u5F53\u524D\u539F\u578B\u6700\u7A33\u59A5\u7684\u9ED8\u8BA4\u65B9\u5411" },
    { id: "professional", label: "\u4E13\u4E1A\u7A33\u91CD", description: "\u7D27\u51D1\u3001\u53EF\u9760\u3001\u4FE1\u606F\u5BC6\u5EA6\u66F4\u9AD8" },
    { id: "friendly", label: "\u8F7B\u677E\u53CB\u597D", description: "\u67D4\u548C\u8272\u5F69\u4E0E\u4EB2\u5207\u53CD\u9988" },
    { id: "bold", label: "\u9C9C\u660E\u5927\u80C6", description: "\u66F4\u5F3A\u5BF9\u6BD4\u4E0E\u89C6\u89C9\u7126\u70B9" },
    { id: "custom", label: "\u81EA\u5B9A\u4E49", description: "\u8865\u5145\u4E00\u4E2A\u6574\u4F53\u89C6\u89C9\u65B9\u5411" }
  ];
  const referenceOption = referenceStyle === null ? null : {
    id: "reference-image",
    label: "\u6CBF\u7528\u53C2\u8003\u56FE\uFF08\u63A8\u8350\uFF09",
    valueLabel: `\u53C2\u8003\u56FE\u98CE\u683C\uFF1A${referenceStyle}`,
    description: "\u63D0\u53D6\u53C2\u8003\u56FE\u7684\u89C6\u89C9\u8BED\u8A00\uFF0C\u9875\u9762\u5185\u5BB9\u548C\u4EA4\u4E92\u4ECD\u4EE5\u539F\u578B\u4E3A\u51C6",
    recommended: true,
    reason: "\u7528\u6237\u5DF2\u7ECF\u63D0\u4F9B\u4E86\u660E\u786E\u7684\u89C6\u89C9\u53C2\u8003"
  };
  const normalizedOptions = referenceOption === null ? options : [referenceOption, ...options.map((option) => ({ ...option, recommended: false, reason: void 0 }))];
  return {
    id: "visual-direction",
    text: "\u9996\u6B21\u751F\u6210\u60F3\u91C7\u7528\u54EA\u4E00\u79CD\u6574\u4F53\u89C6\u89C9\u65B9\u5411\uFF1F",
    selectionMode: "single",
    minSelections: 1,
    allowOther: true,
    options: normalizedOptions,
    recommendedValues: [normalizedOptions.find((option) => option.recommended)?.id ?? normalizedOptions[0].id]
  };
}
function elementsInPages(elements, pageNames) {
  const allPages = prototypePages(elements);
  const selected = allPages.filter((page) => pageNames.includes(page.name));
  const selectedIds = new Set(selected.map((page) => page.id));
  const elementIds = new Set(selected.flatMap((page) => pageElementIds(page, elements, allPages)));
  const scoped = elements.filter((element) => selectedIds.has(str3(element.id)) || elementIds.has(str3(element.id)));
  const assigned = new Set(allPages.flatMap((page) => [page.id, ...pageElementIds(page, elements, allPages)]));
  const allRelations = prototypePageRelations(elements, allPages);
  const relations = allRelations.filter((relation) => {
    return pageNames.includes(relation.sourcePage) || pageNames.includes(relation.targetPage);
  });
  const relationIds = new Set(allRelations.map((relation) => relation.id));
  const relationLabelIds = new Set(elements.flatMap((element) => {
    return str3(element.type) === "text" && relationIds.has(str3(element.containerId)) ? [str3(element.id)] : [];
  }));
  const pageLabelIds = new Set(elements.flatMap((element) => {
    return str3(customData3(element).role).toLowerCase() === "prototype-page-label" ? [str3(element.id)] : [];
  }));
  const unassignedElementCount = elements.filter((element) => {
    const id = str3(element.id);
    return !assigned.has(id) && !relationIds.has(id) && !relationLabelIds.has(id) && !pageLabelIds.has(id);
  }).length;
  return { pages: selected, elements: scoped, unassignedElementCount, relations };
}
function emptyPageIssues(pages, elements) {
  const allPages = prototypePages(elements);
  return pages.flatMap((page) => {
    const meaningful = elements.some((element) => {
      if (element === page.element || str3(element.type) !== "text" || str3(element.text).trim() === "") return false;
      return pageForElement(element, allPages)?.id === page.id;
    });
    return meaningful ? [] : [{ code: "page-content-missing", id: page.id, message: `${page.name} \u53EA\u6709\u7A7A\u6846\uFF0C\u65E0\u6CD5\u5224\u65AD\u9875\u9762\u5185\u5BB9\u548C\u7528\u9014` }];
  });
}
function elementBelongsToPage(element, page, pages) {
  return pageForElement(element, pages)?.id === page.id;
}
function semanticMockDataIssues(pages, elements) {
  const repeatedContentPage = /列表|好友|聊天|消息|清单|统计|图表|日历|万年历|雷达|推荐|记录|详情/u;
  const genericUiText = /^(?:首页|列表|好友|聊天|消息|清单|统计|日历|雷达|推荐|详情|返回|保存|提交|确认|取消|搜索|筛选|新增|添加|我的|设置|发送|请输入.*)$/u;
  return pages.flatMap((page) => {
    const name = page.name;
    if (!repeatedContentPage.test(name)) return [];
    const texts = elements.filter((element) => element !== page.element && str3(element.type) === "text" && elementBelongsToPage(element, page, pages));
    let records = 0;
    for (const element of texts) {
      const value = str3(element.text).trim();
      if (value === "" || value === name || genericUiText.test(value)) continue;
      const role3 = str3((typeof element.customData === "object" && element.customData !== null ? element.customData : {}).role).toLowerCase();
      const lines = value.split(/\r?\n/u).filter((line) => line.trim().length >= 2).length;
      if (role3 === "mock-data" || /\d|·|：|:|公里|km|米|m\b|已|待|完成|进行中|昨天|今天|刚刚/u.test(value) || value.length >= 8) {
        records += Math.max(1, Math.min(3, lines));
      }
    }
    return records >= 3 ? [] : [{
      code: "mock-data-insufficient",
      id: page.id,
      message: `${name} \u9700\u8981\u81F3\u5C11 3 \u6761\u53EF\u8BFB mock \u6570\u636E\u5E2E\u52A9\u7406\u89E3\u9875\u9762\uFF1B\u5F53\u524D\u8BC6\u522B\u5230 ${records} \u6761`
    }];
  });
}
function recordValue(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : null;
}
function jsonRecordValue(value) {
  if (typeof value !== "string") return recordValue(value);
  try {
    return recordValue(JSON.parse(value));
  } catch {
    return null;
  }
}
function recordArray(value) {
  return Array.isArray(value) && value.every((item) => recordValue(item) !== null) ? value : null;
}
function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
function pathIsInside(root, candidate) {
  const rel = relative(root, candidate);
  return rel === "" || !rel.startsWith("..") && !isAbsolute(rel);
}
async function workspaceFile(root, source) {
  const sourceText = str3(source).trim();
  if (sourceText === "") return { ok: false, reason: "source" };
  try {
    const canonicalRoot = await realpath3(root);
    const candidate = isAbsolute(sourceText) ? sourceText : resolve2(canonicalRoot, sourceText);
    const canonicalPath = await realpath3(candidate);
    if (!pathIsInside(canonicalRoot, canonicalPath)) return { ok: false, reason: "outside-workspace" };
    const handle = await open(canonicalPath, "r");
    try {
      const info = await handle.stat();
      if (!info.isFile()) return { ok: false, reason: "not-a-file" };
      if (info.size === 0) return { ok: false, reason: "empty-file" };
      if (info.size > 20 * 1024 * 1024) return { ok: false, reason: "file-too-large" };
      const bytes = await handle.readFile();
      return { ok: true, bytes, path: canonicalPath };
    } finally {
      await handle.close();
    }
  } catch {
    return { ok: false, reason: "file-unreadable" };
  }
}
async function workspaceArtifact(root, source, expectedHash) {
  const hashText = str3(expectedHash).trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/u.test(hashText)) return { ok: false, reason: "sha256" };
  const file = await workspaceFile(root, source);
  if (!file.ok) return file;
  return sha256(file.bytes) === hashText ? file : { ok: false, reason: "sha256-mismatch" };
}
function pngDimensions(bytes) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (bytes.length < 45 || !bytes.subarray(0, 8).equals(signature)) return null;
  let offset = 8;
  let width = 0;
  let height = 0;
  let channels = 0;
  const imageData = [];
  let ended = false;
  try {
    while (offset + 12 <= bytes.length) {
      const length = bytes.readUInt32BE(offset);
      const type = bytes.subarray(offset + 4, offset + 8).toString("ascii");
      const dataStart = offset + 8;
      const dataEnd = dataStart + length;
      if (dataEnd + 4 > bytes.length) return null;
      const data = bytes.subarray(dataStart, dataEnd);
      if (type === "IHDR") {
        if (length !== 13) return null;
        width = data.readUInt32BE(0);
        height = data.readUInt32BE(4);
        const bitDepth = data[8];
        const colorType = data[9];
        const interlace = data[12];
        channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
        if (width <= 0 || height <= 0 || width * height > 1e7 || bitDepth !== 8 || channels === 0 || interlace !== 0) return null;
      } else if (type === "IDAT") {
        imageData.push(data);
      } else if (type === "IEND") {
        ended = true;
        break;
      }
      offset = dataEnd + 4;
    }
    if (!ended || width === 0 || height === 0 || imageData.length === 0) return null;
    const expectedLength = height * (1 + width * channels);
    const inflated = inflateSync(Buffer.concat(imageData), { maxOutputLength: expectedLength });
    if (inflated.length !== expectedLength) return null;
    return { width, height };
  } catch {
    return null;
  }
}
async function previewHtml(root, previewUrl) {
  try {
    const url = new URL(previewUrl);
    let html = "";
    if (url.protocol === "file:") {
      const file = await workspaceFile(root, fileURLToPath(url));
      if (!file.ok) return { ok: false, reason: file.reason };
      html = file.bytes.toString("utf8");
    } else if (url.protocol === "http:" || url.protocol === "https:") {
      if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(url.hostname)) return { ok: false, reason: "preview-not-loopback" };
      const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(3e3) });
      if (!response.ok) return { ok: false, reason: "preview-http-" + response.status };
      const declaredLength = Number(response.headers.get("content-length") ?? 0);
      if (declaredLength > 2 * 1024 * 1024) return { ok: false, reason: "preview-too-large" };
      if (response.body === null) return { ok: false, reason: "preview-empty-body" };
      const reader = response.body.getReader();
      const chunks = [];
      let total = 0;
      while (true) {
        const next = await reader.read();
        if (next.done) break;
        total += next.value.byteLength;
        if (total > 2 * 1024 * 1024) {
          await reader.cancel();
          return { ok: false, reason: "preview-too-large" };
        }
        chunks.push(next.value);
      }
      html = Buffer.concat(chunks).toString("utf8");
    } else {
      return { ok: false, reason: "preview-protocol" };
    }
    if (Buffer.byteLength(html, "utf8") > 2 * 1024 * 1024) return { ok: false, reason: "preview-too-large" };
    return /<!doctype html|<html[\s>]/iu.test(html) ? { ok: true, html } : { ok: false, reason: "preview-not-html" };
  } catch {
    return { ok: false, reason: "preview-unreachable" };
  }
}
function normalizedVisibleText(value) {
  return value.replace(/\s+/gu, " ").trim();
}
function expectedPageTexts(pages, elements) {
  return Object.fromEntries(pages.map((page) => {
    const name = page.name;
    const texts = elements.filter((element) => str3(element.type) === "text" && elementBelongsToPage(element, page, pages)).flatMap((element) => str3(element.text).split(/\r?\n/gu)).map(normalizedVisibleText).filter((value) => value !== "");
    return [name, [...new Set(texts)]];
  }));
}
function pageBlock(html, page) {
  const start = "<!-- d2c-page:" + page + ":start -->";
  const end = "<!-- d2c-page:" + page + ":end -->";
  const startAt = html.indexOf(start);
  if (startAt < 0) return null;
  const contentAt = startAt + start.length;
  const endAt = html.indexOf(end, contentAt);
  return endAt < 0 ? null : html.slice(contentAt, endAt);
}
async function preparePagePreservation(root, draft) {
  const allFrames = draft.allFrames ?? draft.selectedFrames;
  draft.unselectedFrames = allFrames.filter((name) => !draft.selectedFrames.includes(name));
  draft.preservedPageHashes = {};
  if (!draft.hadExistingIndex || draft.unselectedFrames.length === 0) return;
  const file = await workspaceFile(root, resolve2(root, "draw2code-pages", draft.board, "index.html"));
  if (!file.ok) return;
  const html = file.bytes.toString("utf8");
  for (const page of draft.unselectedFrames) {
    const block = pageBlock(html, page);
    if (block !== null) draft.preservedPageHashes[page] = sha256(block);
  }
}
async function preservedPagesStillMatch(root, draft) {
  const hashes = draft.preservedPageHashes ?? {};
  if (Object.keys(hashes).length === 0) return [];
  const file = await workspaceFile(root, resolve2(root, "draw2code-pages", draft.board, "index.html"));
  if (!file.ok) return Object.keys(hashes);
  const html = file.bytes.toString("utf8");
  return Object.entries(hashes).filter(([page, hash]) => {
    const block = pageBlock(html, page);
    return block === null || sha256(block) !== hash;
  }).map(([page]) => page);
}
async function verificationEvidenceFor(root, raw, draft, outputHash) {
  const evidence = jsonRecordValue(raw);
  if (evidence === null) {
    return {
      ok: false,
      code: "verification-evidence-missing",
      message: "\u7F3A\u5C11 verificationEvidence\uFF1B\u5FC5\u987B\u63D0\u4EA4\u771F\u5B9E\u6D4F\u89C8\u5668 URL\u3001\u89C6\u53E3\u3001\u9010\u9875\u622A\u56FE\u3001\u63A7\u5236\u53F0\u3001DOM\u3001\u5E03\u5C40\u548C\u6838\u5FC3\u4EA4\u4E92\u8BC1\u636E"
    };
  }
  const missing = [];
  const failures = [];
  const captureId = str3(evidence.captureId).trim();
  if (captureId === "") missing.push("captureId");
  if (str3(evidence.outputSha256).trim().toLowerCase() !== outputHash) failures.push("outputSha256");
  const previewUrl = str3(evidence.previewUrl).trim();
  if (!/^(?:https?|file):\/\//iu.test(previewUrl)) {
    missing.push("previewUrl");
  } else {
    const preview = await previewHtml(root, previewUrl);
    if (!preview.ok) failures.push("previewUrl:" + preview.reason);
    else if (sha256(preview.html) !== outputHash) failures.push("previewUrl:output-mismatch");
  }
  const viewportKeys = /* @__PURE__ */ new Set();
  const viewports = recordArray(evidence.viewports);
  if (viewports === null || viewports.length === 0) {
    missing.push("viewports");
  } else {
    const validViewports = viewports.filter((viewport) => num3(viewport.width) > 0 && num3(viewport.height) > 0);
    for (const viewport of validViewports) viewportKeys.add(num3(viewport.width) + "x" + num3(viewport.height));
    if (validViewports.length !== viewports.length) missing.push("viewports.width/height");
    if ((draft.device === "mobile" || draft.device === "\u79FB\u52A8\u7AEF H5") && !validViewports.some((viewport) => num3(viewport.width) >= 320 && num3(viewport.width) <= 430 && num3(viewport.height) > num3(viewport.width))) {
      missing.push("320-430px mobile viewport");
    }
    if (draft.device === "desktop" && !validViewports.some((viewport) => num3(viewport.width) >= 1024)) {
      missing.push("desktop viewport >= 1024px");
    }
    if (draft.device === "separate") {
      if (!validViewports.some((viewport) => num3(viewport.width) >= 320 && num3(viewport.width) <= 430)) missing.push("mobile viewport");
      if (!validViewports.some((viewport) => num3(viewport.width) >= 1024)) missing.push("desktop viewport");
    }
  }
  const unselectedEvidencePages = draft.hadExistingIndex ? draft.unselectedFrames ?? [] : [];
  const evidencePages = [.../* @__PURE__ */ new Set([...draft.selectedFrames, ...unselectedEvidencePages])];
  const screenshots = recordArray(evidence.screenshots);
  if (screenshots === null || screenshots.length === 0) {
    missing.push("screenshots");
  } else {
    for (const page of evidencePages) {
      const shot = screenshots.find((candidate) => str3(candidate.page).trim() === page);
      if (shot === void 0) {
        missing.push("screenshot:" + page);
        continue;
      }
      if (str3(shot.captureId).trim() !== captureId) failures.push("screenshot:" + page + ":captureId");
      const viewport = str3(shot.viewport).trim();
      if (!viewportKeys.has(viewport)) missing.push("screenshot-viewport:" + page);
      const artifact = await workspaceArtifact(root, shot.source, shot.sha256);
      if (!artifact.ok) {
        failures.push("screenshot:" + page + ":" + artifact.reason);
        continue;
      }
      const dimensions = pngDimensions(artifact.bytes);
      const match = /^(\d+)x(\d+)$/u.exec(viewport);
      if (dimensions === null || match === null || dimensions.width !== Number(match[1]) || dimensions.height !== Number(match[2])) {
        failures.push("screenshot:" + page + ":dimensions");
      }
    }
  }
  const domSnapshots = recordArray(evidence.domSnapshots);
  if (domSnapshots === null || domSnapshots.length === 0) {
    missing.push("domSnapshots");
  } else {
    for (const page of evidencePages) {
      const snapshot = domSnapshots.find((candidate) => str3(candidate.page).trim() === page);
      if (snapshot === void 0) {
        missing.push("domSnapshot:" + page);
        continue;
      }
      if (str3(snapshot.captureId).trim() !== captureId) failures.push("domSnapshot:" + page + ":captureId");
      const artifact = await workspaceArtifact(root, snapshot.source, snapshot.sha256);
      if (!artifact.ok) {
        failures.push("domSnapshot:" + page + ":" + artifact.reason);
        continue;
      }
      const domHtml = artifact.bytes.toString("utf8");
      if (!/<html(?:\s|>)/iu.test(domHtml) || !/<body(?:\s|>)/iu.test(domHtml)) {
        failures.push("domSnapshot:" + page + ":not-browser-dom");
        continue;
      }
      const bodyText = normalizedVisibleText(domHtml);
      for (const expected of draft.expectedPageTexts?.[page] ?? []) {
        if (!bodyText.includes(normalizedVisibleText(expected))) {
          failures.push("domText:" + page + ":" + expected.slice(0, 24));
        }
      }
    }
  }
  if (!Array.isArray(evidence.consoleErrors)) {
    missing.push("consoleErrors");
  } else if (evidence.consoleErrors.length > 0) {
    failures.push("consoleErrors");
  }
  if (!Array.isArray(evidence.consoleWarnings)) {
    missing.push("consoleWarnings");
  } else if (evidence.consoleWarnings.length > 0) {
    failures.push("consoleWarnings");
  }
  const requiredChecks = [
    ["domChecks", ["selected-pages", "mock-data", ...unselectedEvidencePages.length > 0 ? ["unselected-pages-preserved"] : []]],
    ["layoutChecks", ["no-horizontal-overflow", "content-not-clipped", "button-text-centered", "bottom-navigation-complete"]],
    ["interactionChecks", ["core-flow", ...draft.selectedFrames.length > 1 ? ["page-switching"] : []]]
  ];
  for (const [field, requiredNames] of requiredChecks) {
    const checks = recordArray(evidence[field]);
    if (checks === null || checks.length === 0) {
      missing.push(field);
      continue;
    }
    for (const requiredName of requiredNames) {
      const check = checks.find((item) => str3(item.name) === requiredName);
      if (check === void 0 || str3(check.details).trim() === "") missing.push(field + ":" + requiredName);
      else if (check.passed !== true) failures.push(field + ":" + requiredName);
    }
    for (const check of checks) {
      if (check.passed !== true) failures.push(field + ":" + (str3(check.name) || "unnamed"));
    }
  }
  if (missing.length > 0) {
    return {
      ok: false,
      code: "verification-evidence-incomplete",
      message: "\u771F\u5B9E\u9884\u89C8\u8BC1\u636E\u4E0D\u5B8C\u6574\uFF1A" + [...new Set(missing)].join("\u3001")
    };
  }
  if (failures.length > 0) {
    return {
      ok: false,
      code: "verification-evidence-failed",
      message: "\u771F\u5B9E\u9884\u89C8\u53D1\u73B0\u672A\u4FEE\u590D\u95EE\u9898\uFF1A" + [...new Set(failures)].join("\u3001") + "\uFF1B\u5148\u4FEE\u590D\u9875\u9762\u5E76\u91CD\u65B0\u9A8C\u6536"
    };
  }
  return { ok: true, value: { ...evidence, verified: true } };
}
function briefFor(draft, existingPages) {
  const visualBrief = visualBriefFor(draft.visualDirection ?? "\u7B80\u6D01\u73B0\u4EE3", draft.device, draft.selectedFrames);
  return {
    board: draft.board,
    selectedPages: draft.selectedFrames,
    relatedPageRecommendations: (draft.recommendedFrames ?? []).filter((name) => !draft.selectedFrames.includes(name)),
    pageChanges: existingPages.includes("index.html") ? "\u53EA\u66F4\u65B0\u6240\u9009\u9875\u9762\uFF0C\u672A\u9009\u62E9\u9875\u9762\u4FDD\u6301\u4E0D\u53D8" : "\u9996\u6B21\u751F\u6210\u6240\u9009\u9875\u9762",
    visualDirection: draft.visualDirection,
    referenceStyle: draft.referenceStyle ?? null,
    visualBrief,
    device: draft.device,
    prototypeCheck: draft.blockers.length === 0 ? "\u901A\u8FC7" : "\u6709\u963B\u65AD\u95EE\u9898",
    warnings: draft.warnings,
    assumptions: ["\u8F93\u51FA\u4E3A\u7EDF\u4E00\u5165\u53E3\u7684\u5355\u6587\u4EF6 HTML Demo", "\u5141\u8BB8\u8865\u5145\u901A\u7528\u4EA4\u4E92\u53CD\u9988\uFF0C\u4E0D\u65B0\u589E\u4EA7\u54C1\u9875\u9762\u6216\u4E1A\u52A1\u6D41\u7A0B"],
    preservedContent: existingPages.includes("index.html") ? ["\u672A\u9009\u62E9\u9875\u9762", "\u4E0D\u4E0E\u539F\u578B\u51B2\u7A81\u7684\u5DF2\u6709\u589E\u5F3A"] : [],
    conflicts: existingPages.includes("index.html") ? ["\u751F\u6210 Agent \u5FC5\u987B\u5148\u8BFB\u53D6\u73B0\u6709 index.html\uFF0C\u6838\u5BF9\u6240\u9009\u9875\u9762\u5185\u53EF\u80FD\u88AB\u8986\u76D6\u7684\u624B\u5DE5\u4FEE\u6539"] : [],
    output: `draw2code-pages/${draft.board}/index.html`
  };
}
function hostQuestionFor2(question) {
  return {
    questions: [{
      id: question.id,
      question: question.text,
      header: question.id === "page-scope" ? "\u9875\u9762\u8303\u56F4" : question.id === "visual-direction" ? "\u89C6\u89C9\u65B9\u5411" : "\u76EE\u6807\u8BBE\u5907",
      options: question.options.map((option) => ({ label: option.label, description: option.description })),
      multi_select: question.selectionMode === "multiple"
    }]
  };
}
function responseFromDraft(draft, extras = {}) {
  const confirmation = draft.status === "ready" ? {
    id: "generate-brief-confirm",
    question: "\u6309\u8FD9\u4EFD\u751F\u6210\u7B80\u62A5\u5F00\u59CB\u751F\u6210\u524D\u7AEF Demo \u5417\uFF1F",
    selectionMode: "single",
    options: [
      { id: "confirm", label: "\u786E\u8BA4\u751F\u6210\uFF08\u63A8\u8350\uFF09", description: "\u7ACB\u5373\u6309\u7B80\u62A5\u751F\u6210\u5355\u6587\u4EF6 HTML\uFF0C\u5E76\u8FDB\u5165\u771F\u5B9E\u9884\u89C8\u9A8C\u6536" },
      { id: "revise-scope", label: "\u4FEE\u6539\u9875\u9762\u8303\u56F4", description: "\u8FD4\u56DE\u9875\u9762\u591A\u9009\uFF0C\u4E0D\u91CD\u590D\u8BE2\u95EE\u5176\u4ED6\u5DF2\u5B8C\u6210\u9009\u62E9" },
      { id: "revise-visual", label: "\u4FEE\u6539\u89C6\u89C9\u65B9\u5411", description: "\u91CD\u65B0\u9009\u62E9\u6574\u4F53\u89C6\u89C9\u65B9\u5411\uFF0C\u4FDD\u7559\u9875\u9762\u8303\u56F4" }
    ],
    askUserQuestionArgs: {
      questions: [{
        id: "generate-brief-confirm",
        question: "\u6309\u8FD9\u4EFD\u751F\u6210\u7B80\u62A5\u5F00\u59CB\u751F\u6210\u524D\u7AEF Demo \u5417\uFF1F",
        header: "\u751F\u6210\u786E\u8BA4",
        options: [
          { label: "\u786E\u8BA4\u751F\u6210\uFF08\u63A8\u8350\uFF09", description: "\u7ACB\u5373\u6309\u7B80\u62A5\u751F\u6210\u5355\u6587\u4EF6 HTML\uFF0C\u5E76\u8FDB\u5165\u771F\u5B9E\u9884\u89C8\u9A8C\u6536" },
          { label: "\u4FEE\u6539\u9875\u9762\u8303\u56F4", description: "\u8FD4\u56DE\u9875\u9762\u591A\u9009\uFF0C\u4E0D\u91CD\u590D\u8BE2\u95EE\u5176\u4ED6\u5DF2\u5B8C\u6210\u9009\u62E9" },
          { label: "\u4FEE\u6539\u89C6\u89C9\u65B9\u5411", description: "\u91CD\u65B0\u9009\u62E9\u6574\u4F53\u89C6\u89C9\u65B9\u5411\uFF0C\u4FDD\u7559\u9875\u9762\u8303\u56F4" }
        ],
        multi_select: false
      }]
    }
  } : null;
  return {
    status: draft.status,
    sessionId: draft.sessionId,
    revision: draft.revision,
    board: draft.board,
    ...draft.activeBoard === void 0 ? {} : { activeBoard: draft.activeBoard },
    ...draft.currentQuestion === null ? {} : {
      question: {
        ...draft.currentQuestion,
        askUserQuestionArgs: hostQuestionFor2(draft.currentQuestion)
      }
    },
    ...draft.blockers.length === 0 ? {} : { blockers: draft.blockers },
    ...draft.warnings.length === 0 ? {} : { warnings: draft.warnings },
    ...draft.brief === null ? {} : { brief: draft.brief },
    ...confirmation === null ? {} : { confirmation },
    ...extras
  };
}
async function persistGeneration(store, root, draft, bump = true) {
  if (bump) draft.revision += 1;
  draft.updatedAt = Date.now();
  const saved = await store.writeGeneration(root, draft.sessionId, draft);
  return saved.ok ? null : generateError(saved.error.code, saved.error.message, draft);
}
async function loadGeneration(store, root, sessionId) {
  if (sessionId === void 0 || sessionId.trim() === "") return null;
  const loaded = await store.readGeneration(root, sessionId);
  return loaded.ok ? loaded.value : null;
}
async function runGeneratePreflight(store, root, draft) {
  const board = await store.read(root, draft.board);
  if (!board.ok) return generateError(board.error.code, board.error.message, draft);
  const allPages = prototypePages(board.value.scene.elements);
  draft.allFrames = allPages.map((page) => page.name);
  draft.unselectedFrames = draft.allFrames.filter((name) => !draft.selectedFrames.includes(name));
  draft.expectedPageTexts = expectedPageTexts(allPages, board.value.scene.elements);
  const scope = elementsInPages(board.value.scene.elements, draft.selectedFrames);
  if (scope.pages.length !== draft.selectedFrames.length) {
    const found = new Set(scope.pages.map((page) => page.name));
    const missing = draft.selectedFrames.filter((name) => !found.has(name));
    draft.blockers = [{ code: "page-not-found", message: `\u6240\u9009\u9875\u9762\u5DF2\u4E0D\u5728\u753B\u677F\u4E0A\uFF1A${missing.join("\u3001")}` }];
  } else {
    const report = inspectPrototypeLayout(scope.elements);
    draft.blockers = [
      ...report.errors,
      ...emptyPageIssues(scope.pages, scope.elements),
      ...semanticMockDataIssues(scope.pages, scope.elements)
    ];
    draft.warnings = [
      ...report.warnings,
      ...pageMembershipWarnings(board.value.scene.elements, allPages)
    ].filter((warning, index, all) => all.findIndex((candidate) => JSON.stringify(candidate) === JSON.stringify(warning)) === index);
  }
  const existing = await store.existingPages(root, draft.board);
  if (!existing.ok) return generateError(existing.error.code, existing.error.message, draft);
  draft.currentQuestion = null;
  draft.status = draft.blockers.length > 0 ? "blocked" : "ready";
  draft.brief = draft.status === "ready" ? briefFor(draft, existing.value) : null;
  const failed = await persistGeneration(store, root, draft);
  if (failed !== null) return failed;
  return responseFromDraft(draft, draft.status === "blocked" ? { nextAction: "\u5148\u7528 draw2code_update \u4FEE\u590D\u753B\u677F\uFF1B\u7528\u6237\u68C0\u67E5\u540E\u8C03\u7528 action=recheck\uFF0C\u4FDD\u7559\u5DF2\u9009\u9875\u9762\u548C\u89C6\u89C9\u65B9\u5411" } : { nextAction: "\u5411\u7528\u6237\u5C55\u793A\u4E00\u6B21\u6700\u7EC8\u751F\u6210\u7B80\u62A5\uFF1B\u786E\u8BA4\u540E\u8C03\u7528 action=confirm" });
}
async function generationPayload(store, root, draft) {
  const board = await store.read(root, draft.board);
  if (!board.ok) return generateError(board.error.code, board.error.message, draft);
  const scope = elementsInPages(board.value.scene.elements, draft.selectedFrames);
  const existing = await store.existingPages(root, draft.board);
  if (!existing.ok) return generateError(existing.error.code, existing.error.message, draft);
  const summary = scope.elements.map(describeElement).join("\n");
  const elementsJson = JSON.stringify(scope.elements);
  const elementsBytes = Buffer.byteLength(elementsJson, "utf8");
  const payload = elementsBytes <= MAX_ELEMENTS_JSON ? scope.elements : [{ id: "__too_large__", type: "text", text: `scoped elements JSON is ${elementsBytes} UTF-8 bytes (> ${MAX_ELEMENTS_JSON}); draw2code_read the board instead` }];
  const quality = inspectPrototypeLayout(scope.elements);
  const layoutIssues = [...quality.errors, ...quality.warnings];
  const visualBrief = visualBriefFor(draft.visualDirection ?? "\u7B80\u6D01\u73B0\u4EE3", draft.device, draft.selectedFrames);
  const instructions = buildGenerateInstructions(draft.board, draft.selectedFrames, existing.value, visualBrief, draft.referenceStyle ?? null) + (layoutIssues.length > 0 ? `
13. \u539F\u578B\u975E\u963B\u65AD\u63D0\u9192\uFF1A
${formatLayoutIssues(layoutIssues)}` : "");
  return responseFromDraft(draft, {
    nextAction: "write-html-then-preview-and-validate",
    scope: "pages",
    pageNames: draft.selectedFrames,
    frameNames: draft.selectedFrames,
    summary,
    elements: payload,
    pageRelations: scope.relations,
    unassignedElementCount: scope.unassignedElementCount,
    unframedElementCount: scope.unassignedElementCount,
    layoutWarnings: layoutIssues,
    existingPages: existing.value,
    outputDir: `draw2code-pages/${draft.board}/`,
    instructions
  });
}
function draw2codeGenerateTool(store, projects) {
  return defineTool({
    name: "draw2code_generate",
    description: "Turn selected \u753B\u7801 prototype pages into a verified, interactive, single-file HTML Demo through a resumable choice-first flow. New pages use ordinary rectangle page shells; named Excalidraw Frames remain supported as legacy pages. On any explicit \u201C\u751F\u6210\u9875\u9762 / \u6839\u636E\u753B\u677F\u751F\u6210\u524D\u7AEF / \u91CD\u65B0\u751F\u6210\u201D request, first ask once in ordinary chat whether the user has a reference-style image; do not use ask_user_question for that sentence. If the request already includes a reference image, do not ask again. Then call action=start with referenceStyle set to \u201Cnone\u201D or a concise description/path of the inspected reference. Calls missing referenceStyle return a non-native reference-style-prompt instead of creating a session. The first structured question always asks the user to select pages from every recognized page boundary; pass user-mentioned pages only as recommendations, never skip the choice. Use the host choice UI with all returned options. Then answer the returned visual/device question if present. When status=ready, show the brief once and immediately use the host choice UI with the returned confirmation options; never ask the user to type \u201C\u786E\u8BA4\u201D. Map confirm to action=confirm, revise-scope to action=revise questionId=page-scope, and revise-visual to action=revise questionId=visual-direction. The confirmed result carries elements and instructions for you to write index.html. After writing, automatically open the real preview, capture every selected page, inspect the console and DOM/layout, and exercise the core flow; fix implementation defects without asking. Call action=complete with structured verificationEvidence only after preview passes. Self-reported boolean flags are not accepted as evidence. Never report completion before status=completed. If status=blocked, repair the prototype through draw2code_update first, let the user inspect the board, then call action=recheck with the same sessionId/revision; do not repeat completed choices. action=resume restores interrupted work.",
    parameters: {
      root: { type: "string", required: true, description: "Workspace root (the session working directory)." },
      action: { type: "string", enum: ["start", "answer", "revise", "resume", "recheck", "confirm", "complete", "abandon"], description: "Generate state-machine action. Omit only for legacy callers; omission behaves as start." },
      name: { type: "string", description: "Board name. Omit to use the board currently selected in the \u753B\u7801 UI." },
      pages: { type: "array", items: { type: "string" }, description: "User-mentioned prototype page names, used only as recommended defaults on action=start." },
      frames: { type: "array", items: { type: "string" }, description: "Deprecated compatibility alias for pages. If both are supplied they must contain the same names." },
      styleNote: { type: "string", description: "An explicit overall visual request; skips the first-time visual choice." },
      referenceStyle: { type: "string", description: "Required for action=start after the ordinary-chat reference-image prompt. Use \u201Cnone\u201D when the user has no reference; otherwise pass a concise inspected-image description or local reference path. This prompt must not use ask_user_question." },
      sessionId: { type: "string", description: "Generation session ID from a prior result." },
      revision: { type: "integer", description: "Expected generation revision for mutation actions." },
      questionId: { type: "string", description: "Current question ID for answer/revise." },
      values: { type: "array", items: { type: "string" }, description: "Selected option IDs." },
      otherText: { type: "string", description: "Custom overall visual direction when custom is selected." },
      verificationEvidence: {
        type: "json",
        description: "Required only for action=complete. Object with one captureId, outputSha256, reachable loopback/file previewUrl whose HTML hash matches the generated index, viewports[{width,height}], workspace PNG screenshots[{page,viewport,source,sha256,captureId}] and text domSnapshots[{page,source,sha256,captureId}] covering every related page, empty consoleErrors and consoleWarnings, DOM/layout/core-flow checks. Multiple pages also require page-switching. Every check needs passed=true and non-empty details. Unselected pages are verified by stored page-block hashes plus post-generation artifacts."
      },
      previewOpened: { type: "boolean", description: "Deprecated compatibility field. It no longer satisfies action=complete without verificationEvidence." },
      selectedPagesVisible: { type: "boolean", description: "Deprecated compatibility field. It no longer satisfies action=complete without verificationEvidence." },
      coreFlowPassed: { type: "boolean", description: "Deprecated compatibility field. It no longer satisfies action=complete without verificationEvidence." },
      mockDataVisible: { type: "boolean", description: "Deprecated compatibility field. It no longer satisfies action=complete without verificationEvidence." },
      unselectedPagesPreserved: { type: "boolean", description: "Deprecated compatibility field. Unselected pages are now checked through page markers and evidence artifacts." }
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          status: { type: "string", required: true },
          sessionId: { type: "string" },
          revision: { type: "integer" },
          board: { type: "string" },
          activeBoard: { type: "string" },
          question: { type: "json" },
          blockers: { type: "json" },
          warnings: { type: "json" },
          brief: { type: "json" },
          confirmation: { type: "json" },
          nextAction: { type: "string" },
          error: { type: "json" },
          scope: { type: "string" },
          pageNames: { type: "array", items: { type: "string" } },
          frameNames: { type: "array", items: { type: "string" } },
          summary: { type: "string" },
          elements: { type: "json" },
          pageRelations: { type: "json" },
          unassignedElementCount: { type: "integer" },
          unframedElementCount: { type: "integer" },
          layoutWarnings: { type: "json" },
          existingPages: { type: "array", items: { type: "string" } },
          outputDir: { type: "string" },
          instructions: { type: "string" },
          validation: { type: "json" },
          prompt: { type: "string" }
        }
      },
      render: (_args, value) => {
        if (value.status === "reference-style-prompt") {
          return text2(`${value.prompt ?? REFERENCE_STYLE_PROMPT}
\u8FD9\u662F\u4E00\u53E5\u666E\u901A\u5BF9\u8BDD\u8BE2\u95EE\uFF0C\u4E0D\u5F97\u8C03\u7528 ask_user_question\u3002\u7528\u6237\u56DE\u7B54\u540E\uFF0C\u7528 referenceStyle=none \u6216\u53C2\u8003\u56FE\u6458\u8981\u91CD\u65B0\u8C03\u7528 action=start\u3002`);
        }
        if (value.status === "question") {
          const question = value.question;
          const options = question.options.map((option, index) => `${index + 1}. ${option.id} \u2014 ${option.label}${option.recommended ? `\uFF08\u63A8\u8350\uFF1A${option.reason ?? ""}\uFF09` : ""}`).join("\n");
          return text2(`[draw2code_generate continuation] sessionId=${value.sessionId ?? ""} revision=${value.revision ?? ""} status=question questionId=${question.id}
${question.text}
${options}
\u8C03\u7528 ask_user_question \u65F6\u5FC5\u987B\u539F\u6837\u590D\u5236 question.askUserQuestionArgs\uFF1B\u7279\u522B\u662F page-scope \u5FC5\u987B\u8BBE\u7F6E multi_select=true\uFF0C\u5373\u4F7F\u7528\u6237\u53EA\u70B9\u540D\u4E86\u4E00\u4E2A\u9875\u9762\u4E5F\u4E0D\u80FD\u6539\u6210\u5355\u9009\u3002\u6536\u5230\u9009\u62E9\u540E\u8C03\u7528 action=answer\u3002`);
        }
        if (value.status === "blocked") return text2(`[draw2code_generate continuation] sessionId=${value.sessionId ?? ""} revision=${value.revision ?? ""} status=blocked
\u539F\u578B\u5C1A\u4E0D\u53EF\u751F\u6210\u3002\u5148\u6309 blockers \u8C03\u7528 draw2code_update\uFF0C\u7528\u6237\u770B\u5230\u5E76\u68C0\u67E5\u540E\u8C03\u7528 action=recheck\uFF1B\u4E0D\u8981\u91CD\u590D\u8BE2\u95EE\u9875\u9762\u548C\u89C6\u89C9\u65B9\u5411\u3002`);
        if (value.status === "ready") return text2(`[draw2code_generate continuation] sessionId=${value.sessionId ?? ""} revision=${value.revision ?? ""} status=ready
\u53EA\u5C55\u793A\u4E00\u6B21 brief\uFF0C\u5E76\u7ACB\u5373\u7528\u5BBF\u4E3B ask_user_question \u539F\u6837\u590D\u5236 confirmation.askUserQuestionArgs\uFF0C\u7981\u6B62\u8BA9\u7528\u6237\u624B\u52A8\u8F93\u5165\u201C\u786E\u8BA4\u201D\u3002\u9009\u62E9 confirm \u540E\u8C03\u7528 action=confirm\uFF1Brevise-scope \u8C03 action=revise questionId=page-scope\uFF1Brevise-visual \u8C03 action=revise questionId=visual-direction\u3002`);
        if (value.status === "confirmed") return text2(`[draw2code_generate continuation] sessionId=${value.sessionId ?? ""} revision=${value.revision ?? ""} status=confirmed
\u6309 instructions \u5199\u5165\u5355\u6587\u4EF6 index.html\uFF0C\u7136\u540E\u81EA\u52A8\u6253\u5F00\u771F\u5B9E\u9884\u89C8\uFF0C\u9010\u9875\u622A\u56FE\uFF0C\u68C0\u67E5\u63A7\u5236\u53F0\u3001DOM\u3001\u5E03\u5C40\u548C\u6838\u5FC3\u6D41\u7A0B\uFF1B\u7528\u7ED3\u6784\u5316 verificationEvidence \u8C03\u7528 action=complete\uFF0C\u4E4B\u524D\u4E0D\u5F97\u62A5\u544A\u5B8C\u6210\u3002`);
        if (value.status === "completed") return text2(`draw2code_generate status=completed board=${value.board ?? ""}
\u771F\u5B9E\u9884\u89C8\u4E0E\u6838\u5FC3\u6D41\u7A0B\u5DF2\u9A8C\u6536\uFF0Cgenerate \u6D41\u7A0B\u7ED3\u675F\uFF1B\u540E\u7EED\u666E\u901A\u4FEE\u6539\u4E0D\u81EA\u52A8\u91CD\u65B0\u8FDB\u5165 generate\u3002`);
        if (value.status === "error") return text2(`draw2code_generate \u53EF\u6062\u590D\u9519\u8BEF\uFF1A${JSON.stringify(value.error)}${value.sessionId === void 0 ? "" : `
sessionId=${value.sessionId} revision=${value.revision ?? ""}`}`);
        return text2(`draw2code_generate status=${value.status} sessionId=${value.sessionId ?? ""} revision=${value.revision ?? ""}`);
      }
    },
    async execute(args) {
      const action = args.action ?? "start";
      if (action === "start") {
        if (typeof args.referenceStyle !== "string" || args.referenceStyle.trim() === "") {
          return {
            status: "reference-style-prompt",
            prompt: REFERENCE_STYLE_PROMPT,
            nextAction: "ask-reference-style-then-start"
          };
        }
        const referenceStyle = normalizeReferenceStyle(args.referenceStyle);
        const target = await resolveBoard(store, args.root, args.name);
        const board = await store.read(args.root, target.name);
        if (!board.ok) return generateError(board.error.code, board.error.message);
        const duplicatePageNames = pageNameWarnings(board.value.scene.elements);
        if (duplicatePageNames.length > 0) {
          return generateError("page-name-duplicate", duplicatePageNames.map((warning) => warning.message).join("\uFF1B"));
        }
        const pages = prototypePages(board.value.scene.elements);
        if (pages.length === 0) return generateError("no-pages", `\u753B\u677F\u300C${target.name}\u300D\u6CA1\u6709\u53EF\u8BC6\u522B\u7684\u539F\u578B\u9875\u9762\uFF1B\u65B0\u9875\u9762\u5E94\u4F7F\u7528 rectangle + customData.role=prototype-page + customData.pageName\uFF0C\u65E7\u547D\u540D Frame \u4ECD\u517C\u5BB9`);
        const allNames = pages.map((page) => page.name);
        const requestedPages = [...new Set((args.pages ?? []).map((name) => name.trim()).filter((name) => name !== ""))];
        const requestedFrames = [...new Set((args.frames ?? []).map((name) => name.trim()).filter((name) => name !== ""))];
        if (requestedPages.length > 0 && requestedFrames.length > 0 && JSON.stringify([...requestedPages].sort()) !== JSON.stringify([...requestedFrames].sort())) {
          return generateError("page-scope-conflict", "pages \u4E0E deprecated frames \u6307\u5B9A\u4E86\u4E0D\u540C\u9875\u9762\uFF1B\u8BF7\u53EA\u4F20 pages\uFF0C\u6216\u786E\u4FDD\u4E24\u8005\u5185\u5BB9\u5B8C\u5168\u4E00\u81F4");
        }
        const requested = requestedPages.length > 0 ? requestedPages : requestedFrames;
        const missing = requested.filter((name) => !allNames.includes(name));
        if (missing.length > 0) return generateError("page-not-found", `\u753B\u677F\u4E0A\u6CA1\u6709\u8FD9\u4E9B\u9875\u9762\uFF1A${missing.join("\u3001")}\u3002\u73B0\u6709\u9875\u9762\uFF1A${allNames.join("\u3001")}`);
        const settings = await store.readGenerateSettings(args.root, target.name);
        if (!settings.ok) return generateError(settings.error.code, settings.error.message);
        const inherited = settings.value === null ? null : str3(settings.value.visualDirection).trim() || null;
        const projectList = projects === void 0 ? null : await projects.list(args.root);
        const project = projectList?.ok === true ? projectList.value.find((candidate) => candidate.boardName === target.name) : void 0;
        const projectBrief = project?.brief;
        const briefPages = Array.isArray(projectBrief?.pages) ? projectBrief.pages.flatMap((value) => {
          if (typeof value === "string") return allNames.includes(value) ? [value] : [];
          if (typeof value !== "object" || value === null || Array.isArray(value)) return [];
          const name = str3(value.name).trim();
          return name !== "" && allNames.includes(name) ? [name] : [];
        }) : [];
        const deferredStyle = str3(project?.deferredStyleNote).trim();
        const connected = directlyConnectedPages(board.value.scene.elements, requested);
        const recommended = requested.length > 0 ? [...requested, ...connected] : briefPages.length > 0 ? briefPages : allNames.slice(0, Math.min(3, allNames.length));
        const recommendationReasons = /* @__PURE__ */ new Map();
        for (const name of requested) recommendationReasons.set(name, "\u7528\u6237\u672C\u6B21\u660E\u786E\u70B9\u540D");
        for (const name of connected) recommendationReasons.set(name, "\u4E0E\u7528\u6237\u70B9\u540D\u9875\u9762\u5B58\u5728\u76F4\u63A5 Arrow \u4EA4\u4E92\u5173\u7CFB");
        for (const name of briefPages) recommendationReasons.set(name, "\u6765\u81EA\u5DF2\u786E\u8BA4 create \u7B80\u62A5\u7684\u6838\u5FC3\u9875\u9762");
        if (requested.length === 0 && briefPages.length === 0) {
          for (const name of recommended) recommendationReasons.set(name, "\u4F4D\u4E8E\u5F53\u524D\u753B\u677F\u6838\u5FC3\u6D41\u7A0B\u7684\u524D\u5E8F\u4F4D\u7F6E");
        }
        const existing = await store.existingPages(args.root, target.name);
        if (!existing.ok) return generateError(existing.error.code, existing.error.message);
        const now2 = Date.now();
        const draft2 = {
          sessionId: `generation-${randomUUID2()}`,
          board: target.name,
          ...target.activeBoard === void 0 ? {} : { activeBoard: target.activeBoard },
          status: "question",
          revision: 1,
          createdAt: now2,
          updatedAt: now2,
          currentQuestion: pageScopeQuestion(pages, recommended, recommendationReasons),
          selectedFrames: [],
          allFrames: allNames,
          unselectedFrames: [],
          recommendedFrames: [...new Set(recommended)],
          expectedPageTexts: {},
          preservedPageHashes: {},
          visualDirection: args.styleNote?.trim() || deferredStyle || null,
          inheritedVisualDirection: inherited,
          device: null,
          styleNote: args.styleNote?.trim() || deferredStyle || null,
          referenceStyle,
          blockers: [],
          warnings: [],
          brief: null,
          validation: null,
          hadExistingIndex: existing.value.includes("index.html")
        };
        const failed = await persistGeneration(store, args.root, draft2, false);
        return failed ?? responseFromDraft(draft2);
      }
      const draft = await loadGeneration(store, args.root, args.sessionId);
      if (draft === null) return generateError("not-found", "\u627E\u4E0D\u5230 generate \u4F1A\u8BDD\uFF1B\u8BF7\u4F20\u5165\u4E4B\u524D\u8FD4\u56DE\u7684 sessionId\uFF0C\u6216\u7528 action=start \u5F00\u59CB\u65B0\u4E00\u8F6E");
      if (action === "resume") return responseFromDraft(draft);
      if (draft.status === "completed" || draft.status === "abandoned") return generateError("closed-session", `\u8FD9\u4E2A generate \u4F1A\u8BDD\u5DF2\u7ECF\u662F ${draft.status}\uFF0C\u4E0D\u80FD\u7EE7\u7EED\u4FEE\u6539`, draft);
      if (args.revision !== draft.revision) return generateError("stale-revision", `generate \u4F1A\u8BDD\u5DF2\u66F4\u65B0\uFF1B\u8BF7\u7528\u5F53\u524D revision=${draft.revision} \u7EE7\u7EED`, draft);
      if (action === "abandon") {
        draft.status = "abandoned";
        draft.currentQuestion = null;
        const failed = await persistGeneration(store, args.root, draft);
        return failed ?? responseFromDraft(draft);
      }
      if (action === "revise") {
        const board = await store.read(args.root, draft.board);
        if (!board.ok) return generateError(board.error.code, board.error.message, draft);
        if (args.questionId === "page-scope") draft.currentQuestion = pageScopeQuestion(prototypePages(board.value.scene.elements), draft.selectedFrames);
        else if (args.questionId === "visual-direction") draft.currentQuestion = visualQuestion(board.value.scene.elements, draft.referenceStyle ?? null);
        else return generateError("invalid-question", "\u53EA\u80FD\u4FEE\u6539 page-scope \u6216 visual-direction", draft);
        draft.status = "question";
        draft.brief = null;
        const failed = await persistGeneration(store, args.root, draft);
        return failed ?? responseFromDraft(draft);
      }
      if (action === "answer") {
        const question = draft.currentQuestion;
        if (draft.status !== "question" || question === null) return generateError("invalid-state", "\u5F53\u524D\u6CA1\u6709\u7B49\u5F85\u56DE\u7B54\u7684\u95EE\u9898", draft);
        if (args.questionId !== question.id) return generateError("wrong-question", `\u5F53\u524D\u95EE\u9898\u662F ${question.id}`, draft);
        const values = [...new Set(args.values ?? [])];
        if (values.length < question.minSelections) return generateError("invalid-option", `\u81F3\u5C11\u9009\u62E9 ${question.minSelections} \u9879`, draft);
        if (question.selectionMode === "single" && values.length !== 1) return generateError("invalid-option", "\u8FD9\u4E2A\u95EE\u9898\u53EA\u80FD\u9009\u62E9\u4E00\u9879", draft);
        const optionFor = (value) => question.options.find((option) => option.id === value || option.valueLabel === value);
        const invalid = values.find((value) => optionFor(value) === void 0);
        if (invalid !== void 0) return generateError("invalid-option", `\u9009\u9879\u300C${invalid}\u300D\u4E0D\u5728\u5F53\u524D\u95EE\u9898\u4E2D`, draft);
        const board = await store.read(args.root, draft.board);
        if (!board.ok) return generateError(board.error.code, board.error.message, draft);
        if (question.id === "page-scope") {
          const selectedFrames = values.map((value) => optionFor(value)?.valueLabel ?? value);
          draft.selectedFrames = selectedFrames;
          const scope = elementsInPages(board.value.scene.elements, selectedFrames);
          const inferred = inferDevice(scope.pages);
          if (inferred === "mixed" || inferred === "ambiguous") {
            draft.currentQuestion = deviceQuestion();
            draft.status = "question";
            const failed = await persistGeneration(store, args.root, draft);
            return failed ?? responseFromDraft(draft);
          }
          draft.device = inferred;
        } else if (question.id === "target-device") {
          draft.device = values[0];
        } else {
          const selected = optionFor(values[0]);
          if (values[0] === "custom") {
            const custom = args.otherText?.trim() ?? "";
            if (custom === "") return generateError("custom-required", "\u9009\u62E9\u81EA\u5B9A\u4E49\u65F6\u9700\u8981\u8865\u5145\u6574\u4F53\u89C6\u89C9\u65B9\u5411", draft);
            draft.visualDirection = custom;
          } else {
            draft.visualDirection = selected?.valueLabel ?? selected?.label ?? values[0];
          }
        }
        if (draft.visualDirection === null) draft.visualDirection = draft.inheritedVisualDirection;
        if (draft.visualDirection === null) {
          draft.currentQuestion = visualQuestion(board.value.scene.elements, draft.referenceStyle ?? null);
          draft.status = "question";
          const failed = await persistGeneration(store, args.root, draft);
          return failed ?? responseFromDraft(draft);
        }
        return runGeneratePreflight(store, args.root, draft);
      }
      if (action === "recheck") {
        if (draft.status !== "blocked") return generateError("invalid-state", "\u53EA\u6709 blocked \u72B6\u6001\u9700\u8981 recheck", draft);
        return runGeneratePreflight(store, args.root, draft);
      }
      if (action === "confirm") {
        if (draft.status !== "ready") return generateError("invalid-state", "\u53EA\u6709\u7528\u6237\u786E\u8BA4 ready \u7B80\u62A5\u540E\u624D\u80FD\u751F\u6210", draft);
        const preflight = await runGeneratePreflight(store, args.root, draft);
        if (preflight.status !== "ready") return preflight;
        await preparePagePreservation(args.root, draft);
        draft.status = "confirmed";
        draft.currentQuestion = null;
        const failed = await persistGeneration(store, args.root, draft);
        if (failed !== null) return failed;
        return generationPayload(store, args.root, draft);
      }
      if (action === "complete") {
        if (draft.status !== "confirmed") return generateError("invalid-state", "\u53EA\u6709 confirmed \u4E14 HTML \u5DF2\u5199\u5165\u540E\u624D\u80FD\u63D0\u4EA4\u9A8C\u6536", draft);
        const outputFile = await workspaceFile(args.root, resolve2(args.root, "draw2code-pages", draft.board, "index.html"));
        if (!outputFile.ok) return generateError("generated-index-missing", "\u751F\u6210\u5165\u53E3\u4E0D\u5B58\u5728\u6216\u4E0D\u53EF\u8BFB\u53D6\uFF1A" + outputFile.reason, draft);
        const outputHtml = outputFile.bytes.toString("utf8");
        const missingMarkers = draft.selectedFrames.filter((page) => pageBlock(outputHtml, page) === null);
        if (missingMarkers.length > 0) {
          return generateError("generated-page-marker-missing", "\u751F\u6210\u9875\u9762\u7F3A\u5C11\u7A33\u5B9A\u8FB9\u754C\u6807\u8BB0\uFF1A" + missingMarkers.join("\u3001"), draft);
        }
        const changedPages = await preservedPagesStillMatch(args.root, draft);
        if (changedPages.length > 0) {
          return generateError("unselected-pages-changed", "\u672A\u9009\u62E9\u9875\u9762\u88AB\u4FEE\u6539\u6216\u4E22\u5931\uFF1A" + changedPages.join("\u3001") + "\uFF1B\u6062\u590D\u8FD9\u4E9B\u9875\u9762\u540E\u91CD\u65B0\u9A8C\u6536", draft);
        }
        const evidence = await verificationEvidenceFor(args.root, args.verificationEvidence, draft, sha256(outputFile.bytes));
        if (!evidence.ok) return generateError(evidence.code, evidence.message, draft);
        draft.validation = evidence.value;
        draft.status = "completed";
        const failed = await persistGeneration(store, args.root, draft);
        if (failed !== null) return failed;
        const settings = await store.writeGenerateSettings(args.root, draft.board, { visualDirection: draft.visualDirection });
        if (!settings.ok) return generateError(settings.error.code, settings.error.message, draft);
        return responseFromDraft(draft, { validation: evidence.value });
      }
      return generateError("invalid-action", `\u4E0D\u652F\u6301 action=${action}`, draft);
    }
  });
}

// src/runtime.ts
function choosePresentation(requested = "auto", capabilities) {
  if (requested === "handoff") return "handoff";
  if (requested === "inline") return capabilities.mcpUi ? "inline" : capabilities.externalBrowser ? "browser" : "headless";
  if (requested === "browser") return capabilities.externalBrowser ? "browser" : "headless";
  if (capabilities.mcpUi) return "inline";
  if (capabilities.externalBrowser) return "browser";
  return "headless";
}
function errorCode(error2) {
  const message = error2 instanceof Error ? error2.message : String(error2);
  const match = /^([a-z][a-z0-9_-]*):\s*(.*)$/is.exec(message);
  return match === null ? { code: "internal", message } : { code: match[1], message: match[2] };
}
async function canonicalContext(command, context) {
  let root;
  let workspaceRoot;
  try {
    ;
    [root, workspaceRoot] = await Promise.all([realpath4(command.root), realpath4(context.workspaceRoot)]);
  } catch {
    throw new Error("workspace-unknown: path does not resolve on disk");
  }
  if (!isPathInside(workspaceRoot, root)) throw new Error("workspace-unknown: root is outside the host workspace");
  return { root, workspaceRoot };
}
var Draw2CodeRuntimeImpl = class {
  listeners = /* @__PURE__ */ new Set();
  mutationQueues = /* @__PURE__ */ new Map();
  subscribe(_context, listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  emit(event) {
    for (const listener of this.listeners) listener(event);
  }
  async serialize(key, task) {
    const previous = this.mutationQueues.get(key) ?? Promise.resolve();
    let release = () => void 0;
    const current = new Promise((resolve4) => {
      release = resolve4;
    });
    const tail = previous.catch(() => void 0).then(() => current);
    this.mutationQueues.set(key, tail);
    await previous.catch(() => void 0);
    try {
      return await task();
    } finally {
      release();
      if (this.mutationQueues.get(key) === tail) this.mutationQueues.delete(key);
    }
  }
  async execute(command, context) {
    try {
      const canonical = await canonicalContext(command, context);
      const normalized = { ...command, root: canonical.root };
      const mutating = normalized.type === "create" || normalized.type === "update" || normalized.type === "generate";
      const task = () => this.executeCanonical(normalized, { ...context, workspaceRoot: canonical.workspaceRoot });
      return mutating ? await this.serialize(canonical.root, task) : await task();
    } catch (error2) {
      return { ok: false, command: command.type, error: errorCode(error2) };
    }
  }
  async executeCanonical(command, context) {
    const storeContext = storeContextFor(context.workspaceRoot);
    const scenes = new SceneStore(storeContext);
    const projects = new ProjectStore(storeContext);
    let data;
    if (command.type === "list") {
      data = await draw2codeListTool(scenes).execute({ root: command.root }, {});
    } else if (command.type === "read") {
      data = await draw2codeReadTool(scenes).execute({ root: command.root, ...command.board === void 0 ? {} : { name: command.board } }, {});
    } else if (command.type === "create") {
      data = await draw2codeCreateTool(projects, scenes).execute({ ...command.input, root: command.root }, {});
    } else if (command.type === "update") {
      data = await draw2codeUpdateTool(scenes).execute({
        root: command.root,
        ...command.board === void 0 ? {} : { name: command.board },
        ...command.action === void 0 ? {} : { action: command.action },
        ...command.ops === void 0 ? {} : { ops: command.ops },
        ...command.force === void 0 ? {} : { force: command.force },
        ...command.safeMode === void 0 ? {} : { safeMode: command.safeMode },
        ...command.reviewToken === void 0 ? {} : { reviewToken: command.reviewToken },
        ...command.phase === void 0 ? {} : { phase: command.phase },
        ...command.passed === void 0 ? {} : { passed: command.passed },
        ...command.inspectedPageIds === void 0 ? {} : { inspectedPageIds: command.inspectedPageIds },
        ...command.observations === void 0 ? {} : { observations: command.observations },
        ...command.pendingUpdateId === void 0 ? {} : { pendingUpdateId: command.pendingUpdateId },
        ...command.visualReview === void 0 ? {} : { visualReview: command.visualReview }
      }, {});
    } else if (command.type === "generate") {
      data = await draw2codeGenerateTool(scenes, projects).execute({ ...command.input, root: command.root }, {});
    } else {
      const active = command.board === void 0 ? await scenes.getActiveBoard(command.root) : { ok: true, value: { name: command.board } };
      if (!active.ok) throw new Error(`${active.error.code}: ${active.error.message}`);
      const board = active.value.name;
      let revision = 0;
      let operational = {};
      if (board !== null) {
        const read = await scenes.read(command.root, board);
        if (!read.ok) throw new Error(`${read.error.code}: ${read.error.message}`);
        revision = read.value.rev;
        operational = await boardOperationalState(scenes, command.root, board, revision, read.value.scene);
      }
      const presentation = choosePresentation(command.presentation, context.uiCapabilities);
      data = {
        board,
        revision,
        presentation,
        ...operational,
        ...presentation === "inline" ? { resourceUri: "ui://draw2code/canvas.html" } : {},
        opened: false
      };
    }
    if (command.type === "update" && data.writeVerified === true) {
      const board = String(data.targetBoard ?? command.board ?? "prototype");
      const revision = Number(data.rev ?? 0);
      this.emit({ type: "scene.updated", root: command.root, board, revision, sourceClientId: context.clientId });
      if (data.activeBoard === board) {
        this.emit({ type: "active-board.changed", root: command.root, board, sourceClientId: context.clientId });
      }
      if (typeof data.revealRequestId === "string") {
        this.emit({ type: "board.reveal-requested", root: command.root, board, requestId: data.revealRequestId, sourceClientId: context.clientId });
      }
    }
    if (command.type === "create" && data.status === "confirmed" && typeof data.boardName === "string") {
      this.emit({ type: "active-board.changed", root: command.root, board: data.boardName, sourceClientId: context.clientId });
    }
    return { ok: true, command: command.type, data };
  }
};
function randomToken(bytes) {
  return randomBytes(bytes).toString("base64url");
}
async function createDaemonDescriptor(path, input) {
  const descriptor = {
    ...input,
    nonce: randomToken(18),
    token: randomToken(32),
    startedAt: Date.now()
  };
  await mkdir3(dirname(path), { recursive: true, mode: 448 });
  const tmp = `${path}.tmp-${process.pid}-${randomToken(6)}`;
  await writeFile4(tmp, `${JSON.stringify(descriptor)}
`, { encoding: "utf8", mode: 384 });
  await rename3(tmp, path);
  return descriptor;
}

// src/workspace-registry.ts
import { chmod, mkdir as mkdir4, readFile as readFile4, realpath as realpath5, rename as rename4, writeFile as writeFile5 } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname as dirname2, join as join3 } from "node:path";
function defaultWorkspaceRegistryPath() {
  return process.env.DRAW2CODE_WORKSPACE_REGISTRY_PATH ?? join3(homedir(), ".draw2code", "workspaces.json");
}
function isWorkspacePickerCandidate(path) {
  return !/\/\.codex\/plugins\/cache(?:\/|$)/.test(path.replaceAll("\\", "/"));
}
var WorkspaceRegistry = class {
  constructor(path = defaultWorkspaceRegistryPath()) {
    this.path = path;
  }
  writeQueue = Promise.resolve();
  async read() {
    let value;
    try {
      value = JSON.parse(await readFile4(this.path, "utf8"));
    } catch {
      return [];
    }
    if (typeof value !== "object" || value === null || !Array.isArray(value.workspaces)) return [];
    const rows = [];
    const seen = /* @__PURE__ */ new Set();
    for (const candidate of value.workspaces ?? []) {
      if (typeof candidate?.path !== "string") continue;
      let canonical;
      try {
        canonical = await realpath5(candidate.path);
      } catch {
        continue;
      }
      if (seen.has(canonical)) continue;
      seen.add(canonical);
      rows.push({
        path: canonical,
        registeredAt: Number.isFinite(candidate.registeredAt) ? candidate.registeredAt : Date.now(),
        lastUsedAt: Number.isFinite(candidate.lastUsedAt) ? candidate.lastUsedAt : Date.now()
      });
    }
    return rows;
  }
  async list() {
    return await this.read();
  }
  async register(path) {
    const canonical = await realpath5(path);
    const task = this.writeQueue.then(async () => {
      const now2 = Date.now();
      const rows = await this.read();
      const existing = rows.find((row) => row.path === canonical);
      if (existing === void 0) rows.push({ path: canonical, registeredAt: now2, lastUsedAt: now2 });
      else existing.lastUsedAt = now2;
      rows.sort((left, right) => right.lastUsedAt - left.lastUsedAt);
      await mkdir4(dirname2(this.path), { recursive: true, mode: 448 });
      const temporary = `${this.path}.tmp-${process.pid}-${now2}`;
      await writeFile5(temporary, `${JSON.stringify({ version: 1, workspaces: rows }, null, 2)}
`, { encoding: "utf8", mode: 384 });
      await rename4(temporary, this.path);
      await chmod(this.path, 384);
    });
    this.writeQueue = task.catch(() => void 0);
    await task;
    return canonical;
  }
};

// src/daemon-server.ts
var MAX_BODY_BYTES = 2 * 1024 * 1024;
var CANVAS_TOKEN_TTL_MS = 15 * 6e4;
function writeJson2(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}
async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) throw new Error("request body too large");
    chunks.push(buffer);
  }
  const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (typeof value !== "object" || value === null) throw new Error("request body must be an object");
  return value;
}
function loopback(req) {
  const address = req.socket.remoteAddress;
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}
function bearer(req) {
  const value = req.headers.authorization;
  return typeof value === "string" && value.startsWith("Bearer ") ? value.slice(7) : null;
}
function requestRoot(req, body) {
  const url = new URL2(req.url ?? "/", "http://localhost");
  const queryRoot = url.searchParams.get("root");
  if (queryRoot !== null) return queryRoot;
  return typeof body?.root === "string" ? body.root : null;
}
function safeEqual(left, right) {
  return createHash2("sha256").update(left).digest("hex") === createHash2("sha256").update(right).digest("hex");
}
async function startDaemon(options) {
  const runtime = new Draw2CodeRuntimeImpl();
  const workspaceRegistry = new WorkspaceRegistry(options.workspaceRegistryPath ?? defaultWorkspaceRegistryPath());
  const roots = new Set((await workspaceRegistry.list()).map((row) => row.path));
  const grants = /* @__PURE__ */ new Map();
  const sockets = /* @__PURE__ */ new Map();
  let descriptor;
  let lastActivity = Date.now();
  const canvasTokenTtlMs2 = options.canvasTokenTtlMs ?? CANVAS_TOKEN_TTL_MS;
  const storeContext = {
    workspaceRegistry: { list: () => [...roots].map((path) => ({ path })) },
    logger: { warn: (message, ...args) => console.warn(message, ...args) }
  };
  const sceneRoutes = makeRoutes(new SceneStore(storeContext));
  const registerWorkspace = async (path) => {
    const canonical = await realpath6(path);
    if (roots.has(canonical)) return canonical;
    await workspaceRegistry.register(canonical);
    roots.add(canonical);
    return canonical;
  };
  const issueCanvasGrant = (root, allowedRoots, board) => {
    const token = randomBytes2(24).toString("base64url");
    const expiresAt = Date.now() + canvasTokenTtlMs2;
    grants.set(token, { root, allowedRoots, expiresAt });
    const query = new URLSearchParams({ root, token, ...board === null ? {} : { board } });
    return { token, expiresAt, url: `http://127.0.0.1:${descriptor.port}/canvas?${query}` };
  };
  const switchableRoots = async (currentRoot) => {
    const store = new SceneStore(storeContext);
    const allowed = [];
    for (const workspaceRoot of roots) {
      if (workspaceRoot === currentRoot) {
        allowed.push(workspaceRoot);
        continue;
      }
      if (!isWorkspacePickerCandidate(workspaceRoot)) continue;
      const listed = await store.list(workspaceRoot);
      if (listed.ok && listed.value.length > 0) allowed.push(workspaceRoot);
    }
    return allowed;
  };
  const authorize = async (req, root) => {
    const token = bearer(req) ?? new URL2(req.url ?? "/", "http://localhost").searchParams.get("token");
    if (token !== null && safeEqual(token, descriptor.token)) return { ok: true };
    if (token === null || root === null) return { ok: false };
    const grant = grants.get(token);
    if (grant === void 0 || grant.expiresAt < Date.now()) {
      grants.delete(token);
      return { ok: false };
    }
    try {
      if (await realpath6(root) !== grant.root) return { ok: false };
      grant.expiresAt = Date.now() + canvasTokenTtlMs2;
      return { ok: true, grant };
    } catch {
      return { ok: false };
    }
  };
  const boardForRequest = (url, body) => typeof body?.name === "string" ? body.name : url.searchParams.get("name");
  const broadcast = async (root, event) => {
    let canonicalRoot;
    try {
      canonicalRoot = await realpath6(root);
    } catch {
      return;
    }
    const payload = JSON.stringify(event);
    for (const [socket, socketRoot] of sockets) {
      if (socketRoot === canonicalRoot && socket.readyState === socket.OPEN) socket.send(payload);
    }
  };
  const server = createServer(async (req, res) => {
    lastActivity = Date.now();
    if (!loopback(req)) {
      writeJson2(res, 403, { ok: false, error: { code: "forbidden", message: "loopback-only" } });
      return;
    }
    const url = new URL2(req.url ?? "/", "http://localhost");
    if (url.pathname === "/health") {
      if (!safeEqual(bearer(req) ?? "", descriptor.token)) {
        writeJson2(res, 401, { ok: false, error: { code: "unauthorized", message: "invalid bearer token" } });
        return;
      }
      writeJson2(res, 200, { ok: true, pid: process.pid, nonce: descriptor.nonce });
      return;
    }
    if (url.pathname === "/rpc" && req.method === "POST") {
      if (!safeEqual(bearer(req) ?? "", descriptor.token)) {
        writeJson2(res, 401, { ok: false, error: { code: "unauthorized", message: "invalid bearer token" } });
        return;
      }
      try {
        const body = await readJson(req);
        const context = body.context;
        const command = body.command;
        if (typeof context?.workspaceRoot !== "string" || typeof command?.root !== "string") throw new Error("invalid command or context");
        const canonicalWorkspace = await realpath6(context.workspaceRoot);
        await registerWorkspace(canonicalWorkspace);
        const result = await runtime.execute(command, { ...context, workspaceRoot: canonicalWorkspace });
        writeJson2(res, result.ok ? 200 : result.error.code === "workspace-unknown" ? 403 : 400, result);
      } catch (error2) {
        writeJson2(res, 400, { ok: false, error: { code: "bad-request", message: error2 instanceof Error ? error2.message : String(error2) } });
      }
      return;
    }
    if (url.pathname === "/register" && req.method === "POST") {
      if (!safeEqual(bearer(req) ?? "", descriptor.token)) {
        writeJson2(res, 401, { ok: false, error: { code: "unauthorized", message: "invalid bearer token" } });
        return;
      }
      try {
        const body = await readJson(req);
        const context = body.context;
        const root = await realpath6(String(body.root ?? ""));
        const workspace = await realpath6(context.workspaceRoot);
        if (root !== workspace && !root.startsWith(`${workspace}/`)) throw new Error("root is outside the host workspace");
        await registerWorkspace(workspace);
        writeJson2(res, 200, { ok: true, root, workspaceRoot: workspace });
      } catch (error2) {
        writeJson2(res, 400, { ok: false, error: { code: "bad-request", message: error2 instanceof Error ? error2.message : String(error2) } });
      }
      return;
    }
    if (url.pathname === "/canvas-token" && req.method === "POST") {
      if (!safeEqual(bearer(req) ?? "", descriptor.token)) {
        writeJson2(res, 401, { ok: false, error: { code: "unauthorized", message: "invalid bearer token" } });
        return;
      }
      try {
        const body = await readJson(req);
        const context = body.context;
        const root = await realpath6(String(body.root ?? ""));
        const workspace = await realpath6(context.workspaceRoot);
        if (root !== workspace && !root.startsWith(`${workspace}/`)) throw new Error("root is outside the host workspace");
        await registerWorkspace(workspace);
        const board = typeof body.board === "string" ? body.board : null;
        writeJson2(res, 200, { ok: true, ...issueCanvasGrant(root, await switchableRoots(root), board) });
      } catch (error2) {
        writeJson2(res, 400, { ok: false, error: { code: "bad-request", message: error2 instanceof Error ? error2.message : String(error2) } });
      }
      return;
    }
    if (url.pathname === "/canvas-workspaces" && req.method === "GET") {
      const root = url.searchParams.get("root");
      const authorized = await authorize(req, root);
      if (!authorized.ok || authorized.grant === void 0) {
        writeJson2(res, 401, { ok: false, error: { code: "unauthorized", message: "workspace-scoped canvas token required" } });
        return;
      }
      const workspaces = [];
      for (const workspaceRoot of authorized.grant.allowedRoots) {
        if (!roots.has(workspaceRoot)) continue;
        const listed = await new SceneStore(storeContext).list(workspaceRoot);
        if (!listed.ok) continue;
        workspaces.push({ root: workspaceRoot, name: basename(workspaceRoot), boardCount: listed.value.length });
      }
      workspaces.sort((left, right) => left.name.localeCompare(right.name, "zh-CN") || left.root.localeCompare(right.root));
      writeJson2(res, 200, { ok: true, workspaces });
      return;
    }
    if (url.pathname === "/canvas-workspace-token" && req.method === "POST") {
      try {
        const body = await readJson(req);
        const root = typeof body.root === "string" ? body.root : null;
        const authorized = await authorize(req, root);
        if (!authorized.ok || authorized.grant === void 0) {
          writeJson2(res, 401, { ok: false, error: { code: "unauthorized", message: "workspace-scoped canvas token required" } });
          return;
        }
        const targetRoot = await realpath6(String(body.targetRoot ?? ""));
        if (!authorized.grant.allowedRoots.includes(targetRoot) || !roots.has(targetRoot)) {
          writeJson2(res, 403, { ok: false, error: { code: "forbidden", message: "target workspace was not registered when this canvas opened" } });
          return;
        }
        writeJson2(res, 200, { ok: true, root: targetRoot, ...issueCanvasGrant(targetRoot, authorized.grant.allowedRoots, null) });
      } catch (error2) {
        writeJson2(res, 400, { ok: false, error: { code: "bad-request", message: error2 instanceof Error ? error2.message : String(error2) } });
      }
      return;
    }
    if (url.pathname === "/canvas" && req.method === "GET") {
      const root = url.searchParams.get("root");
      if (!(await authorize(req, root)).ok) {
        writeJson2(res, 401, { ok: false, error: { code: "unauthorized", message: "invalid or expired canvas token" } });
        return;
      }
      try {
        const html = await readFile5(options.canvasHtmlPath, "utf8");
        res.writeHead(200, {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store",
          "content-security-policy": "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob:; connect-src 'self' ws:; img-src 'self' data: blob:"
        });
        res.end(html);
      } catch {
        writeJson2(res, 503, { ok: false, error: { code: "canvas-unavailable", message: "canvas bundle is missing" } });
      }
      return;
    }
    if (url.pathname.startsWith("/api/draw2code/")) {
      let body;
      if (req.method !== "GET" && req.method !== "DELETE") {
        try {
          body = await readJson(req);
          const encoded = Buffer.from(JSON.stringify(body));
          req[Symbol.asyncIterator] = async function* () {
            yield encoded;
          };
        } catch (error2) {
          writeJson2(res, 400, { ok: false, error: { code: "bad-request", message: error2 instanceof Error ? error2.message : String(error2) } });
          return;
        }
      }
      const root = requestRoot(req, body);
      const authorized = await authorize(req, root);
      if (!authorized.ok) {
        writeJson2(res, 401, { ok: false, error: { code: "unauthorized", message: "invalid bearer or scoped token" } });
        return;
      }
      const board = boardForRequest(url, body);
      const route = sceneRoutes.find((candidate) => candidate.path === url.pathname);
      if (route === void 0) {
        writeJson2(res, 404, { ok: false, error: { code: "not-found", message: "route not found" } });
        return;
      }
      await route.handler(req, res);
      if (root !== null && board !== null && (req.method === "PUT" || req.method === "POST")) {
        const latest = await new SceneStore(storeContext).read(root, board);
        if (latest.ok) {
          await broadcast(root, { type: "scene.updated", root, board, revision: latest.value.rev, sourceClientId: "canvas" });
        }
      }
      if (root !== null && board !== null && req.method === "DELETE") {
        await broadcast(root, { type: "board.deleted", root, board, revision: Date.now(), sourceClientId: "canvas" });
      }
      if (root !== null && url.pathname === "/api/draw2code/active-board" && req.method === "PUT" && typeof body?.name === "string") {
        await broadcast(root, { type: "active-board.changed", root, board: body.name, sourceClientId: "canvas" });
      }
      return;
    }
    writeJson2(res, 404, { ok: false, error: { code: "not-found", message: "route not found" } });
  });
  const websocket = new import_websocket_server.default({ noServer: true });
  server.on("upgrade", async (req, socket, head) => {
    const url = new URL2(req.url ?? "/", "http://localhost");
    const root = url.searchParams.get("root");
    const authorized = await authorize(req, root);
    if (url.pathname !== "/events" || !loopback(req) || !authorized.ok || root === null) {
      socket.destroy();
      return;
    }
    let canonicalRoot;
    try {
      canonicalRoot = await realpath6(root);
    } catch {
      socket.destroy();
      return;
    }
    websocket.handleUpgrade(req, socket, head, (client) => {
      sockets.set(client, canonicalRoot);
      client.once("close", () => sockets.delete(client));
      client.send(JSON.stringify({ type: "connected", root: canonicalRoot }));
    });
  });
  runtime.subscribe({}, (event) => {
    void broadcast(event.root, event);
  });
  await new Promise((resolve4, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve4());
  });
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("daemon did not bind a TCP port");
  descriptor = await createDaemonDescriptor(options.descriptorPath, { pid: process.pid, port: address.port });
  const idleTimer = setInterval(() => {
    for (const [token, grant] of grants) if (grant.expiresAt < Date.now()) grants.delete(token);
    const idleMs = options.idleMs ?? 10 * 6e4;
    if (sockets.size === 0 && Date.now() - lastActivity > idleMs) void close();
  }, 3e4);
  idleTimer.unref();
  const close = async () => {
    clearInterval(idleTimer);
    for (const socket of sockets.keys()) socket.close();
    await new Promise((resolve4) => server.close(() => resolve4()));
    try {
      const current = JSON.parse(await readFile5(options.descriptorPath, "utf8"));
      if (current.nonce === descriptor.nonce) await rm2(options.descriptorPath, { force: true });
    } catch {
    }
  };
  return { descriptor, close };
}

// src/daemon-main.ts
var descriptorPath = process.env.DRAW2CODE_DESCRIPTOR_PATH;
if (descriptorPath === void 0 || descriptorPath === "") throw new Error("DRAW2CODE_DESCRIPTOR_PATH is required");
var canvasHtmlPath = process.env.DRAW2CODE_CANVAS_HTML ?? resolve3(import.meta.dirname, "../lib/canvas.html");
var configuredTokenTtl = Number(process.env.DRAW2CODE_CANVAS_TOKEN_TTL_MS);
var canvasTokenTtlMs = Number.isFinite(configuredTokenTtl) && configuredTokenTtl > 0 ? configuredTokenTtl : void 0;
var daemon = await startDaemon({ descriptorPath, canvasHtmlPath, ...canvasTokenTtlMs === void 0 ? {} : { canvasTokenTtlMs } });
var shutdown = () => {
  void daemon.close().finally(() => process.exit(0));
};
process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
