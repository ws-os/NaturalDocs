
/*
	Topic: Integers

		(code)

			int x = 12;

			int x = -12;

			long x = 123456789l;

			long x = -123456789L;

			uint x = 12U;

			ulong x = 123456789ul;

			int x = 0x01230ABC;

			ulong x = 0xabc12345UL;

		(end)


	Topic: Floating Point

		(code)

			float x = 12;

			float x = -12f;

			float x = 12e1;

			float x = -12E-1F;

			double x = .012;

			double x = -.012D;

			double x = .012E+5d;

			double x = -.012e10;

			decimal x = 0.0123M;

			decimal x = -123.123;

			decimal x = 0.0123E10;

			decimal x = -123.123e-9m;

		(end)


	Topic: Traps

		The fact that the hex value ends in E shouldn't make it think the following token is part of
		the number as an exponent.

		(code)

			int x = 0x000E+a;

			int x = 0x000e-1;

		(end)


		The minus sign should be part of the number for -1 but not for x-1.

		(code)

			int x = -1;

			int x = y-1;

			int x = y -1;

			int x = 1-1;

			int x = 1 -1;

			int x = (-1);

			int x = 1 + -1;

		(end)
*/
