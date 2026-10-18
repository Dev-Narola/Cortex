"""Architecture validation tests.

V9 Part 4, Task 45.

These tests enforce the hexagonal architecture rules:

* ``domain`` packages do not import from ``application``,
  ``infrastructure``, or ``interface``.
* ``application`` packages do not import from
  ``infrastructure`` or ``interface``.
* ``infrastructure`` packages do not import from
  ``interface``.
* No circular imports between bounded contexts.
* Every bounded context exposes a single entrypoint under
  ``interface/``.

A violation of any rule fails the build at CI time.
"""
