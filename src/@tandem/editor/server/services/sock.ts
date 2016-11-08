import { IActor } from "@tandem/common/actors";
import { OpenProjectAction } from "@tandem/editor/common";
import { IEdtorServerConfig } from "@tandem/editor/server/config";
import { CoreApplicationService } from "@tandem/core";
import { ApplicationServiceProvider } from "@tandem/common";
import { LoadAction, InitializeAction, SockBus, Action, isPublicAction, serialize, deserialize } from "@tandem/common";
import * as os from "os";
import * as path from "path";
import * as net from "net";
import * as fsa from "fs-extra";

const SOCK_FILE = path.join(os.tmpdir(), `tandem-${process.env.USER}.sock`);

class ExecAction extends Action {
  static readonly EXEC = "exec";
  constructor(readonly config: IEdtorServerConfig) {
    super(ExecAction.EXEC);
  }
  static execute(config: any, bus: IActor) {
    return bus.execute(new ExecAction(config)).readAll();
  }
}

export class SockService extends CoreApplicationService<IEdtorServerConfig> {

  private _socketFile: string;

  constructor() {
    super();
    this._socketFile = SOCK_FILE;
  }

  /**
   */

  [LoadAction.LOAD](action: LoadAction) {

    return new Promise((resolve, reject) => {
      let bus: IActor;

      const client = net.connect({ path: this._socketFile } as any);

      client.once("connect", async () => {
        await ExecAction.execute(this.config, new SockBus(client, this.bus, { serialize, deserialize }));
        client.end();
        this._printSockFile();
      })

      client.once("error", this._startSocketServer.bind(this));
      client.once("error", resolve);
    });
  }

  [ExecAction.EXEC]({ config }: ExecAction) {
    if (config.argv._.length) {
      OpenProjectAction.execute({ filePath: path.resolve(config.cwd, config.argv._[0]) }, this.bus);
    }
  }

  [InitializeAction.INITIALIZE](action: LoadAction) {
    if (this.config.argv) {
      ExecAction.execute(this.config, this.bus);
    }
    this._printSockFile();
  }

  private _printSockFile() {
    if (this.config.argv.exposeSockFile) {
      console.log("---sock file start---\n%s\n---sock file end---", SOCK_FILE);
    }
  }

  private _startSocketServer() {
    this._deleteSocketFile();
    const server = net.createServer((connection) => {
      const bus = new SockBus(connection, {
        execute: (action) => {
          action["$$sock"] = true;
          return this.bus.execute(action);
        }
      }, { serialize, deserialize });
      const gateBus = {
        execute(action: Action) {
          if (isPublicAction(action) && !action["$$sock"]) {
            action["$$sock"] = true;
            return bus.execute(action);
          }
        }
      };
      connection.on("close", () => {
        this.bus.unregister(gateBus);
      })

      this.bus.register(gateBus);
    });

    server.listen(SOCK_FILE);
  }

  private _deleteSocketFile() {
    fsa.removeSync(SOCK_FILE);
  }
}
