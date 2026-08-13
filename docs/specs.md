# Spécifications de `@itrocks/sql-build`

## Responsabilité

`@itrocks/sql-build` construit des requêtes de lecture SQL paramétrées à partir de définitions libres de tables et de
colonnes. Il assemble les projections, la table racine, les jointures et les filtres, mais ne connaît ni la réflexion
it.rocks, ni un pilote de base de données, ni des objets métier.

La résolution des chemins relationnels et le rendu des clauses `JOIN` appartiennent exclusivement à
`@itrocks/sql-join`. Le builder partage une même instance de `Joins` entre `Columns`, `Where` et `Tables` afin que les
alias et l'ordre des jointures restent déterministes.

## Contrats de données

- `TableDefinition` est la définition libre reçue à la construction d'une requête.
- `ColumnDefinition` est la définition libre résolue par `@itrocks/sql-join` pour un segment de chemin.
- `ColumnSelection` est un chemin scalaire, ou un couple `{ path, alias }`.
- `WhereConditions` est un dictionnaire ordonné de chemins scalaires vers leurs valeurs.
- `SqlQuery` contient le texte SQL avec placeholders et la liste séparée des valeurs.

Le cœur ne déduit jamais un nom SQL depuis un chemin. La dépendance `columnOf(ColumnDefinition)` fournit le nom physique
final de chaque colonne scalaire. `placeholderOf(position)` permet d'adapter les placeholders au dialecte du driver.

## Construction d'une requête

Le constructeur `Select(tableDefinition, columns, where, options)` garde les projections et les conditions comme
arguments séparés : ce sont les deux entrées de l'usage courant. L'objet `options` est réservé aux réglages secondaires,
dont le préfixe d'alias. `Count(tableDefinition, where, options)` applique le même principe sans argument de projection.

`Select.build()` suit cet ordre :

1. `Where` résout ses chemins et enregistre les jointures nécessaires.
2. `Columns` résout ses chemins dans la même instance de `Joins`.
3. `Tables` rend la table racine puis toutes les jointures enregistrées.
4. `Select` assemble les fragments et retourne les valeurs de `Where` sans les interpoler.

`Count.build()` suit la même séquence sans projection métier et rend `COUNT(*) AS count`.

## Comportement de la phase 1

- Les chemins pris en charge sont des chemins scalaires simples séparés par des points.
- Les relations objet et collections 1-N sont celles du palier 1 de `@itrocks/sql-join`.
- Une projection imbriquée reçoit son chemin complet comme alias, sauf alias explicite.
- L'absence de projections rend uniquement `alias_racine.*`.
- Tous les filtres sont liés par `AND` dans l'ordre d'insertion.
- Une valeur ordinaire rend une égalité avec le placeholder configuré et ajoute une valeur liée.
- `null` rend `IS NULL` et n'ajoute aucune valeur.
- Un `SqlFunction` de `@itrocks/sql-functions` fournit un opérateur contenant exactement un placeholder et une valeur.
- Une projection qui s'arrête sur une relation lève une erreur : l'expansion d'objet appartient à une phase ultérieure.

## Invariants

- Aucune valeur applicative n'est concaténée au texte SQL.
- Tous les identifiants produits par le builder passent par `quoteIdentifier`.
- Une jointure n'est jamais implémentée localement : le builder utilise `Joins` et son rendu.
- Les définitions de métadonnées restent distinctes de leurs noms SQL physiques.
- Le package ne dépend pas de `@itrocks/framework`, de `@itrocks/reflect`, de `@itrocks/mysql` ou de
  `@itrocks/path-sql`.
