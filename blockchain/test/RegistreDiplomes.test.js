const { expect } = require('chai');
const { ethers } = require('hardhat');
const { createHash } = require('crypto');

// Hash SHA-256 (bytes32) d'une chaîne — représente le snapshot signé d'un diplôme.
function hash(str) {
  return '0x' + createHash('sha256').update(str).digest('hex');
}

describe('RegistreDiplomes', function () {
  let registre, proprietaire, ministere, autre;
  const HASH_A = hash('DIP-2026-00001|Koffi ADJO');
  const REF_A = 'DIP-2026-00001';

  beforeEach(async function () {
    [proprietaire, ministere, autre] = await ethers.getSigners();
    const Registre = await ethers.getContractFactory('RegistreDiplomes');
    registre = await Registre.deploy();
    await registre.waitForDeployment();
  });

  describe('Déploiement', function () {
    it('définit le déployeur comme propriétaire et autorisé', async function () {
      expect(await registre.proprietaire()).to.equal(proprietaire.address);
      expect(await registre.autorises(proprietaire.address)).to.equal(true);
      expect(await registre.nombreDiplomes()).to.equal(0);
    });
  });

  describe('Certification', function () {
    it('certifie un diplôme et émet DiplomeCertifie', async function () {
      await expect(registre.certifier(HASH_A, REF_A))
        .to.emit(registre, 'DiplomeCertifie')
        .withArgs(HASH_A, REF_A, proprietaire.address, anyUint());
      expect(await registre.nombreDiplomes()).to.equal(1);
      expect(await registre.estValide(HASH_A)).to.equal(true);
    });

    it('renvoie les bonnes données via verifier()', async function () {
      await registre.certifier(HASH_A, REF_A);
      const v = await registre.verifier(HASH_A);
      expect(v.existe).to.equal(true);
      expect(v.revoque).to.equal(false);
      expect(v.refDiplome).to.equal(REF_A);
      expect(v.certificateur).to.equal(proprietaire.address);
    });

    it('retrouve le hash par la référence', async function () {
      await registre.certifier(HASH_A, REF_A);
      expect(await registre.hashDeReference(REF_A)).to.equal(HASH_A);
    });

    it('refuse un hash déjà certifié', async function () {
      await registre.certifier(HASH_A, REF_A);
      await expect(registre.certifier(HASH_A, 'DIP-2026-99999')).to.be.revertedWith(
        'Diplome deja certifie'
      );
    });

    it('refuse une référence déjà utilisée', async function () {
      await registre.certifier(HASH_A, REF_A);
      await expect(registre.certifier(hash('autre'), REF_A)).to.be.revertedWith(
        'Reference deja utilisee'
      );
    });

    it('refuse un hash nul ou une référence vide', async function () {
      await expect(registre.certifier(ethers.ZeroHash, REF_A)).to.be.revertedWith('Hash invalide');
      await expect(registre.certifier(HASH_A, '')).to.be.revertedWith('Reference requise');
    });

    it("refuse une adresse non autorisée", async function () {
      await expect(registre.connect(autre).certifier(HASH_A, REF_A)).to.be.revertedWith(
        'Adresse non autorisee a certifier'
      );
    });
  });

  describe('Révocation', function () {
    beforeEach(async function () {
      await registre.certifier(HASH_A, REF_A);
    });

    it('révoque un diplôme et émet DiplomeRevoque', async function () {
      await expect(registre.revoquer(HASH_A, 'Fraude avérée'))
        .to.emit(registre, 'DiplomeRevoque')
        .withArgs(HASH_A, 'Fraude avérée', proprietaire.address);
      expect(await registre.estValide(HASH_A)).to.equal(false);
      const v = await registre.verifier(HASH_A);
      expect(v.revoque).to.equal(true);
      expect(v.motifRevocation).to.equal('Fraude avérée');
    });

    it('refuse de révoquer un diplôme inexistant', async function () {
      await expect(registre.revoquer(hash('inconnu'), 'x')).to.be.revertedWith(
        'Diplome introuvable'
      );
    });

    it('refuse une double révocation', async function () {
      await registre.revoquer(HASH_A, 'Fraude');
      await expect(registre.revoquer(HASH_A, 'Encore')).to.be.revertedWith('Diplome deja revoque');
    });

    it('exige un motif', async function () {
      await expect(registre.revoquer(HASH_A, '')).to.be.revertedWith('Motif requis');
    });
  });

  describe('Autorisations', function () {
    it('le propriétaire peut autoriser une adresse à certifier', async function () {
      await expect(registre.autoriser(ministere.address))
        .to.emit(registre, 'AutorisationAccordee')
        .withArgs(ministere.address);
      await registre.connect(ministere).certifier(HASH_A, REF_A);
      expect(await registre.nombreDiplomes()).to.equal(1);
    });

    it('le propriétaire peut retirer une autorisation', async function () {
      await registre.autoriser(ministere.address);
      await registre.retirerAutorisation(ministere.address);
      await expect(registre.connect(ministere).certifier(HASH_A, REF_A)).to.be.revertedWith(
        'Adresse non autorisee a certifier'
      );
    });

    it("un non-propriétaire ne peut pas autoriser", async function () {
      await expect(registre.connect(autre).autoriser(ministere.address)).to.be.revertedWith(
        'Reserve au proprietaire'
      );
    });

    it('transfère la propriété', async function () {
      await registre.transfererPropriete(ministere.address);
      expect(await registre.proprietaire()).to.equal(ministere.address);
      expect(await registre.autorises(ministere.address)).to.equal(true);
    });
  });
});

// Matcher utilitaire : accepte n'importe quel uint (horodatage du bloc).
function anyUint() {
  const { anyValue } = require('@nomicfoundation/hardhat-chai-matchers/withArgs');
  return anyValue;
}
