import BN from 'bn.js';
import { AccountLayout } from '@solana/spl-token';
import {
  Vault,
  SafetyDepositBox,
  AddTokenToInactiveVault,
} from '@metaplex-foundation/mpl-token-vault';
import { Connection, TransactionSignature, PublicKey, Keypair } from '@solana/web3.js';

import { Wallet } from '../wallet';
import { createApproveTxs } from './shared';
import { sendTransaction } from './transactions';
import { CreateTokenAccount } from '../transactions';
import { TransactionsBatch } from '../utils/transactions-batch';

interface Token2Add {
  tokenAccount: PublicKey;
  tokenMint: PublicKey;
  amount: BN;
}

interface SafetyDepositTokenStore {
  txId: TransactionSignature;
  tokenAccount: PublicKey;
  tokenStoreAccount: PublicKey;
  tokenMint: PublicKey;
}

interface AddTokensToVaultParams {
  connection: Connection;
  wallet: Wallet;
  vault: PublicKey;
  nfts: Token2Add[];
  isUninitialized?: boolean;
}

interface AddTokensToVaultResponse {
  safetyDepositTokenStores: SafetyDepositTokenStore[];
  txBatch: Array<TransactionsBatch>;
}

export const addTokensToVault = async ({
  connection,
  wallet,
  vault,
  nfts,
  isUninitialized = false,
}: AddTokensToVaultParams): Promise<AddTokensToVaultResponse> => {
  const txOptions = { feePayer: wallet.publicKey };
  const safetyDepositTokenStores: SafetyDepositTokenStore[] = [];

  const vaultAuthority = await Vault.getPDA(vault);
  const accountRent = await connection.getMinimumBalanceForRentExemption(AccountLayout.span);

  const allBatch: Array<TransactionsBatch> = [];
  for (const nft of nfts) {
    const tokenTxBatch = new TransactionsBatch({ transactions: [] });
    const safetyDepositBox = await SafetyDepositBox.getPDA(vault, nft.tokenMint);

    const tokenStoreAccount = Keypair.generate();
    const tokenStoreAccountTx = new CreateTokenAccount(txOptions, {
      newAccountPubkey: tokenStoreAccount.publicKey,
      lamports: accountRent,
      mint: nft.tokenMint,
      owner: vaultAuthority,
    });
    tokenTxBatch.addTransaction(tokenStoreAccountTx);
    tokenTxBatch.addSigner(tokenStoreAccount);

    const { authority: transferAuthority, createApproveTx } = createApproveTxs({
      account: nft.tokenAccount,
      owner: wallet.publicKey,
      amount: nft.amount.toNumber(),
    });
    tokenTxBatch.addTransaction(createApproveTx);
    tokenTxBatch.addSigner(transferAuthority);

    const addTokenTx = new AddTokenToInactiveVault(txOptions, {
      vault,
      vaultAuthority: wallet.publicKey,
      tokenAccount: nft.tokenAccount,
      tokenStoreAccount: tokenStoreAccount.publicKey,
      transferAuthority: transferAuthority.publicKey,
      safetyDepositBox: safetyDepositBox,
      amount: nft.amount,
    });
    tokenTxBatch.addTransaction(addTokenTx);

    const txId = await sendTransaction({
      connection,
      wallet,
      txs: tokenTxBatch.transactions,
      signers: tokenTxBatch.signers,
      isUninitialized,
    });

    allBatch.push(tokenTxBatch);
    safetyDepositTokenStores.push({
      txId,
      tokenStoreAccount: tokenStoreAccount.publicKey,
      tokenMint: nft.tokenMint,
      tokenAccount: nft.tokenAccount,
    });
  }

  return { safetyDepositTokenStores, txBatch: allBatch };
};
