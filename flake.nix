{
  description = "create-gmacko-app template shell for ForgeGraph-style deployments";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };

  outputs = { nixpkgs, ... }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "x86_64-darwin"
        "aarch64-darwin"
      ];
      forAllSystems = nixpkgs.lib.genAttrs systems;
    in {
      devShells = forAllSystems (system:
        let
          pkgs = nixpkgs.legacyPackages.${system};
        in {
          default = pkgs.mkShell {
            packages = [
              pkgs.nodejs_22
              pkgs.pnpm_10
              pkgs.postgresql_16
              pkgs.git
            ]
            ++ pkgs.lib.optionals pkgs.stdenv.isLinux [
              pkgs.docker
              pkgs.docker-compose
            ];

            shellHook = ''
              echo "ForgeGraph-oriented development shell"
              echo "Run: pnpm install"
              echo "Run: pnpm db:migrate:local && pnpm db:seed   # local D1 (apps/web)"
              echo "Run: docker compose up -d postgres && pnpm db:legacy:push   # legacy Postgres (apps/nextjs, until Phase 8)"
            '';
          };
        });
    };
}
