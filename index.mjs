// NOTE: kill all port-fw process before
// ps au |grep port-for| grep ":9944" |grep -v grep  |awk '{print $2}' | xargs kill -9

const BASE_PORT=6000
const REMOTE_PORT=9944

import { ApiPromise, WsProvider } from "@polkadot/api";
import { Keyring } from "@polkadot/keyring";
import { cryptoWaitReady } from "@polkadot/util-crypto";
import { spawn } from "child_process";
import fs from "fs";

async function connect(apiUrl) {
  const provider = new WsProvider(apiUrl);
  const api = new ApiPromise({ provider });
  await api.isReady;
  return api;
}

async function get_signer() {
  await cryptoWaitReady();

  const keyring = new Keyring({ type: "sr25519" });
  const sudo = keyring.addFromUri(process.env.SUDO_SEED|| "demo");


  return sudo;
}


async function sendTx(api, sudo, index) {
  let nonce = (
      (await api.query.system.account(sudo.address))
  ).nonce.toNumber();
  console.log(`[index: ${index}] nonce: ${nonce}`);

  const unsub = await api.tx.sudo
  .sudo(api.tx.system.setStorage(
    (
      ("0x1cb6f36e027abb2091cfb5110ab5087f38316cbf8fa0da822a20ac1c55bf1be3", "0x7734000000000000"),
      ("0x1cb6f36e027abb2091cfb5110ab5087f37b8842f54c7eddf02b5e584aa2ae6cc", "0x00")
    ),
  ))
  .signAndSend(sudo, { nonce: nonce, era: 0 }, (result) => {
    console.log(`[index: ${index}] Current status is ${result.status}`);
    if (result.status.isInBlock) {
      console.log(
        `[index: ${index}] Transaction included at blockhash ${result.status.asInBlock}`,
      );
      if (finalization) {
        console.log(`[index: ${index}] Waiting for finalization...`);
      } else {
        unsub();
        return resolve();
      }
    } else if (result.status.isFinalized) {
      console.log(
        `[index: ${index}] Transaction finalized at blockHash ${result.status.asFinalized}`,
      );
      unsub();
      return resolve();
    } else if (result.isError) {
      console.log(`T[index: ${index}] ransaction error`);
      reject(`[index: ${index}] Transaction error`);
    }
  });
}


async function run_one(endpoint, index, sudo) {
    console.log(`[index: ${index}] creating port-fw for ${endpoint} with index ${index} (6000 + index)`);
    let localPort = BASE_PORT + index;
    await startPortForwarding(localPort, REMOTE_PORT, endpoint);
    console.log(`[index: ${index}] connected! port-fw for ${endpoint} local: ${localPort} - remote ${REMOTE_PORT}`);
    const api = await connect(`ws://localhost:${localPort}`);
    console.log(`[index: ${index}] api connected!`);

    await sendTx(api, sudo, index);
}

async function run_all(endpoints) {
  const sudo = await get_signer();
  let index = -1;
  let p = endpoints.map(e => {
    index +=1;
    return run_one(e, index, sudo);
  });

  await Promise.all(p);
  console.log("finished!");
}

async function startPortForwarding(
    localPort,
    remoteport,
    identifier
  ) {
    let intents = 0;
    const createTunnel = (
      remotePort,
      identifier,
      localPort
    ) => {
      const mapping = localPort ? `${localPort}:${remotePort}` : `:${remotePort}`;
      const args = [
        "port-forward",
        `svc/${identifier}`,
        mapping,
        "--namespace",
        "rococo"
      ];

      console.log(args);

      const subprocess = spawn("kubectl", args);
      return subprocess;
    };

    return new Promise((resolve) => {
      let subprocess = createTunnel(
        remoteport,
        identifier,
        localPort,
      );

      let resolved = false;
      let mappedPort;
      subprocess.stdout.on("data", function (data) {
        if (resolved) return;
        const stdout = data.toString();
        const m = /.\d{1,3}:(\d+)/.exec(stdout);
        console.log("stdout: " + stdout);
        if (m && !resolved) {
          resolved = true;
          mappedPort = parseInt(m[1], 10);
          return resolve(mappedPort);
        }
      });

      subprocess.stderr.on("data", function (data) {
        const s = data.toString();
        if (resolved && s.includes("error")) {
          console.log("stderr: " + s);
        }
      });

      subprocess.on("exit", function (data) {
        console.log(data);
        console.log("child process exited");
        if (resolved && intents < 5 && process.env.terminating !== "1") {
          intents++;
          subprocess = null;
          console.log(
            `creating new port-fw for ${identifier}, with map ${mappedPort}:${port}`,
          );
          createTunnel(port, identifier, namespace, mappedPort);
        }
      });
    });
  }


const e = fs.readFileSync(process.argv[2]).toString().split("\n").filter(Boolean);
(async () => {
  await run_all(e);
  console.log("DONE!");
})();