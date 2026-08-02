import * as argon2 from "argon2";

describe("Argon2 password foundation", () => {
  it("hashes a password without storing the plaintext value", async () => {
    const password = "correct horse battery staple";
    const hash = await argon2.hash(password);

    expect(hash).not.toBe(password);
    expect(hash).toMatch(/^\$argon2/);
  });

  it("verifies the correct password and rejects an incorrect password", async () => {
    const password = "correct horse battery staple";
    const hash = await argon2.hash(password);

    await expect(argon2.verify(hash, password)).resolves.toBe(true);
    await expect(argon2.verify(hash, "incorrect password")).resolves.toBe(false);
  });
});
