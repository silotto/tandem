"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var mesh7_1 = require("mesh7");
var mesh_ds7_1 = require("mesh-ds7");
var messages_1 = require("../messages");
var PostDsNotifierBus = /** @class */ (function () {
    function PostDsNotifierBus(_dsBus, _dispatcher) {
        this._dsBus = _dsBus;
        this._dispatcher = _dispatcher;
    }
    PostDsNotifierBus.prototype.dispatch = function (message) {
        var _this = this;
        if ([mesh_ds7_1.DSInsertRequest.DS_INSERT, mesh_ds7_1.DSRemoveRequest.DS_REMOVE, mesh_ds7_1.DSUpdateRequest.DS_UPDATE].indexOf(message.type) > -1) {
            return new mesh7_1.DuplexStream(function (input, output) {
                var writer = output.getWriter();
                _this._dsBus.dispatch(message).readable.pipeTo(new mesh7_1.WritableStream({
                    write: function (chunk) {
                        writer.write(chunk);
                        _this._dispatcher.dispatch(messages_1.PostDSMessage.createFromDSRequest(message, chunk));
                    }
                })).then(writer.close.bind(writer)).catch(writer.abort.bind(writer));
            });
        }
        return this._dsBus.dispatch(message);
    };
    return PostDsNotifierBus;
}());
exports.PostDsNotifierBus = PostDsNotifierBus;
//# sourceMappingURL=post-ds-notifier.js.map