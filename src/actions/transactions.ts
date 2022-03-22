import { Keypair, SendOptions } from '@solana/web3.js';
import { Wallet } from '../wallet';
import { Connection } from '../Connection';
import { Transaction } from '@metaplex-foundation/mpl-core';

/** Parameters for {@link sendTransaction} **/
export interface SendTransactionParams {
  connection: Connection;
  wallet: Wallet;
  txs: Transaction[];
  signers?: Keypair[];
  options?: SendOptions;
  isUninitialized?: boolean;
}

/**
 * Sign and send transactions for validation
 * @return This action returns the resulting transaction id once it has been executed
 */
export const sendTransaction = async ({
  connection,
  wallet,
  txs,
  signers = [],
  options,
  isUninitialized = true,
}: SendTransactionParams): Promise<string> => {
  let tx = Transaction.fromCombined(txs, { feePayer: wallet.publicKey });
  tx.recentBlockhash = (await connection.getRecentBlockhash()).blockhash;
  if (isUninitialized) {
    return '';
  }

  if (signers.length) {
    tx.partialSign(...signers);
  }
  tx = await wallet.signTransaction(tx);

  return connection.sendRawTransaction(tx.serialize(), options);
};
