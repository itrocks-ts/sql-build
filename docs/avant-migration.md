# Étude avant migration du builder SQL PHP

## Objet

Ce document prépare la migration de `ITRocks\Framework\Sql\Builder` vers `@itrocks/sql-build`. Il inventorie le code
PHP, les usages réels, les packages TypeScript déjà propriétaires de certaines fonctions et les phases de livraison.

Seule la phase 1 est développée dans ce chantier. Les phases suivantes définissent des frontières et un ordre de
travail, pas une API déjà disponible.

Sources étudiées à la révision PHP `8454258fc92574cc5ad35207293311f56d7fbb42` :

- [`Builder.php`](/home/baptiste/itrocks/boust/itrocks/framework/sql/builder/Builder.php:15) : utilitaires de
  colonnes et requêtes d'écriture ;
- [`Columns.php`](/home/baptiste/itrocks/boust/itrocks/framework/sql/builder/Columns.php:24) : projections et expansion
  d'objets ;
- [`Where.php`](/home/baptiste/itrocks/boust/itrocks/framework/sql/builder/Where.php:27) : filtres récursifs ;
- [`Tables.php`](/home/baptiste/itrocks/boust/itrocks/framework/sql/builder/Tables.php:9) : table racine et jointures ;
- [`Select.php`](/home/baptiste/itrocks/boust/itrocks/framework/sql/builder/Select.php:16) et
  [`Count.php`](/home/baptiste/itrocks/boust/itrocks/framework/sql/builder/Count.php:12) : orchestration des lectures ;
- [`Select_Test.php`](/home/baptiste/itrocks/boust/itrocks/framework/sql/builder/Select_Test.php:20) : cas
  fonctionnels ;
- les builders de maps, de tables, de vues et les traits du même répertoire.

La référence TypeScript pour l'organisation du portage est `@itrocks/sql-join` à la révision
`a14799695bb46462a015f7bd62ed8f33f01671f4`, notamment ses documents `avant-migration.md`, `dependencies.md` et
`specs.md`.

## Inventaire PHP

| Fichier                   | Rôle historique                                   | Cible                         |
|---------------------------|---------------------------------------------------|-------------------------------|
| `Builder.php`             | DML, colonnes, valeurs et découpage de chemins    | Phase 6 ou helper local       |
| `Columns.php`             | Projections, alias, objets et traductions         | Phases 1 et 3                 |
| `Where.php`               | Égalités, fonctions, logique et objets            | Phases 1 et 2                 |
| `Tables.php`              | Table racine et clauses `JOIN`                    | Phase 1 avec `sql-join`       |
| `Select.php`              | Assemblage et options de lecture                  | Phases 1 et 4                 |
| `Count.php`               | Comptage et optimisation par `UNION`              | Phases 1 et 4                 |
| `Map*.php`                | Écritures des relations N-N                       | Data source MySQL             |
| `Create_Table.php`        | DDL MySQL de création                             | `schema-to-mysql`             |
| `Alter_Table.php`         | DDL MySQL de modification et contrôles            | `schema-diff-mysql`           |
| `Create_View.php`         | DDL MySQL de vue                                  | Future `schema-to-mysql`      |
| `Has_*.php`, `With_*.php` | Partage par traits et interface                   | Composition TypeScript        |
| `Link_Property_Name.php`  | Préfixe d'alias lié à une option DAO              | `aliasPrefix`                 |

Le portage n'est donc pas une traduction fichier pour fichier. Les fichiers DDL et les écritures N-N ont un owner cible
plus précis dans l'architecture TypeScript, même lorsque toutes leurs fonctions PHP n'y sont pas encore développées.

## Usages réels dans le dépôt PHP

La recherche des imports `use ...Framework\Sql...` dans le framework et l'application montre que l'application métier
n'instancie pas directement le builder. Elle passe par le DAO. Les consommateurs directs sont principalement :

- le lien MySQL, qui construit `Select` et `Count` pour `search`, `read` et `count` ;
- l'écriture MySQL, qui utilise les helpers `INSERT`, `UPDATE` et les builders de maps ;
- les fonctions DAO, qui demandent au builder de résoudre une colonne ou construisent des sous-requêtes ;
- le restrictor SQL, le générateur de vues et le summary builder ;
- les tests `Select_Test.php` et `dao/func/Func_Test.php`.

Cette topologie confirme que le package doit rester générique et que le framework ou le data source doit adapter les
métadonnées et les options métier.

Exemples concrets ayant guidé les phases :

- [`Link::count()`](/home/baptiste/itrocks/boust/itrocks/framework/dao/mysql/Link.php:240) construit `Count`, tandis que
  la recherche construit `Select` avant d'exécuter puis d'hydrater les lignes
  ([source](/home/baptiste/itrocks/boust/itrocks/framework/dao/mysql/Link.php:1180)). Cela justifie de livrer ensemble
  `Select`, `Count` et un résultat paramétré dès la phase 1.
- `Dao\Sql\Select::prepareQuery()` récupère aussi les classes et tables résolues par les jointures
  ([source](/home/baptiste/itrocks/boust/itrocks/framework/dao/sql/Select.php:423)). L'inventaire relationnel reste donc
  la responsabilité de `@itrocks/sql-join`.
- [`Write.php`](/home/baptiste/itrocks/boust/itrocks/framework/dao/mysql/Write.php:373) appelle les helpers d'insertion
  et de mise à jour, puis utilise `Map_Insert` et `Map_Delete` pour les collections N-N
  ([source](/home/baptiste/itrocks/boust/itrocks/framework/dao/mysql/Write.php:495)). Ces appels appartiennent au data
  source et sont différés hors de la phase 1.
- [`Func_Test::testInSelect()`](/home/baptiste/itrocks/boust/itrocks/framework/dao/func/Func_Test.php:106) compose une
  sous-requête, et `testIsGreatest()` construit une sous-requête groupée jointe. Ils fixent les besoins futurs des
  phases 2 et 4 sans justifier de recopier les fonctions DAO PHP.
- [`View_Builder_Class`](/home/baptiste/itrocks/boust/itrocks/framework/dao/mysql/View_Builder_Class.php:121) produit
  chaque branche d'une vue à partir de `Select`. Le rendu de la vue elle-même reste un besoin du dialecte DDL.

## Réutilisation des packages it.rocks

L'inventaire de [it.rocks](https://it.rocks), puis la lecture des sources locales, attribuent les responsabilités
suivantes :

- [`@itrocks/sql-join`](https://github.com/itrocks-ts/sql-join) possède les jointures, les alias et la résolution des
  chemins relationnels. `sql-build` l'utilise sans modèle de jointure local.
- [`@itrocks/sql-functions`](https://github.com/itrocks-ts/sql-functions) possède les comparaisons telles que `like`,
  `greater` et `lessOrEqual`. La phase 1 consomme directement `SqlFunction`.
- `@itrocks/path-sql` est un prototype ancien : ses classes `Select`, `Columns` et `Where` sont des squelettes sans
  rendu ni tests et le package dépend lui-même de l'ancien `sql-build`. Il ne devient ni dépendance ni référence d'API.
- `@itrocks/reflect-path` reste le propriétaire des chemins typés. Une intégration future pourra adapter ses
  `PropertyPath` sans l'imposer au cœur.
- `@itrocks/reflect`, `@itrocks/store`, `@itrocks/rename`, `@itrocks/required` et `@itrocks/composition` alimentent les
  métadonnées dans le framework ; le cœur ne les importe pas.
- `@itrocks/schema`, `@itrocks/schema-to-mysql` et `@itrocks/schema-diff-mysql` possèdent le modèle et le rendu DDL.
- `@itrocks/storage` et `@itrocks/mysql` possèdent l'exécution, l'hydratation, les transactions et les écritures de
  relations.

## Différences volontaires avec le PHP

Le PHP interpole ou échappe les valeurs dans une chaîne. Le port TypeScript retourne `{ sql, values }` et utilise des
placeholders `?`. Cette séparation est un invariant de sécurité et facilite l'utilisation directe par un driver.

Les arguments fréquents `columns` et `where` restent séparés et positionnels, comme en PHP, afin de garder l'appel
courant concis. Seuls les réglages secondaires sont regroupés dans un objet d'options. Les définitions de tables et de
colonnes sont libres et génériques ; toute connaissance de la réflexion reste dans la composition du framework.

Les méthodes ou traits sans consommateur autonome ne sont pas reproduits comme stubs. Ils entrent dans une phase
seulement lorsqu'un comportement complet les utilise.

## Plan de migration

### Phase 1 — lectures paramétrées simples

Objectif : produire des `SELECT` et `COUNT` utilisables pour les chemins couverts par le palier 1 de `sql-join`.

Livré :

1. `SqlQuery` sépare le SQL et les valeurs.
2. `Columns` rend un wildcard racine, des colonnes scalaires et leurs alias.
3. `Where` rend un dictionnaire plat lié par `AND`, avec égalité, `null` et `SqlFunction` à un placeholder.
4. `Tables` rend la table racine puis les jointures de `@itrocks/sql-join`.
5. `Select` et `Count` partagent une instance de `Joins` et orchestrent les fragments dans le bon ordre.
6. `sqlBuildDependsOn()` adapte les colonnes, placeholders et identifiants.
7. Le framework fournit son adaptateur `columnOf` dans son composition root.

Cas de référence portés : sélection simple, relation objet, collection 1-N, filtre sur chemin joint, filtre `null`,
fonction `LIKE`, comptage, préfixe d'alias et métadonnées arbitraires.

Limites assumées : une projection doit se terminer sur une colonne scalaire ; les filtres sont plats ; les chemins
inverses et N-N attendent les paliers correspondants de `sql-join`.

### Phase 2 — arbres de filtres

Ajouter une représentation typée des groupes `AND`, `OR` et `NOT`, des listes de valeurs et des fonctions à plusieurs
paramètres. Les opérateurs SQL restent la responsabilité de `@itrocks/sql-functions`; cette phase doit étendre ou
consommer son API au lieu de recopier les classes PHP `dao/func`.

Porter alors les tests PHP de tableaux imbriqués, `OR` implicite et objets de recherche après définition d'un adaptateur
d'objet explicite. Aucun objet métier ne doit être introspecté directement par le cœur.

### Phase 3 — projections riches et hydratation

Ajouter l'expansion explicite d'une relation, les alias d'hydratation et la sélection des colonnes stockées. Les
métadonnées d'énumération de propriétés seront injectées. Les propriétés remplacées, traductions, représentatives et
classes de lien ne seront activées qu'avec leurs packages propriétaires et les paliers adéquats de `sql-join`.

### Phase 4 — modificateurs de lecture

Ajouter `DISTINCT`, tri, groupe, `HAVING`, limite et offset sous forme d'options nommées. Les options de
`@itrocks/storage` et les chemins de `@itrocks/sort` seront adaptés dans le data source ou le framework, sans créer de
dépendance métier dans le cœur. Porter ensuite les sous-requêtes et `UNION` nécessaires au comptage optimisé.

### Phase 5 — chemins relationnels avancés

Consommer successivement les futures phases de `@itrocks/sql-join` pour les relations N-N, chemins inverses,
polymorphisme et classes de lien. Chaque capacité ne sera exposée dans `sql-build` qu'après stabilisation et test de son
contrat dans `sql-join`.

### Phase 6 — DML portable

Évaluer puis ajouter des builders paramétrés `INSERT`, `UPDATE` et `DELETE` seulement si `@itrocks/mysql` peut les
consommer. Le format portable utilisera `INSERT INTO (...) VALUES (...)`, pas le `SET` spécifique à MySQL. La conversion
des objets et les écritures N-N resteront dans le data source.

## Hors périmètre durable

- Le DDL et la maintenance de schéma restent dans les packages `schema-*` et `mysql-maintainer`.
- L'exécution, les connexions, transactions et transformations de valeurs restent dans les data sources.
- La réflexion et les décorateurs restent dans le framework et les packages de métadonnées.
- `path-sql` n'est pas une dépendance tant que son rôle n'est pas redéfini après stabilisation de `sql-build`.
