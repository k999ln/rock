package dev.rock.automation;

/** Derives the stable Android user boundary from a Linux application UID. */
final class AndroidOwner {
    // AOSP allocates this many application UIDs to each Android user.
    static final int PER_USER_RANGE = 100_000;

    private AndroidOwner() { }

    static String forUid(int uid) {
        if (uid < 0) throw new IllegalArgumentException("INVALID_ANDROID_UID");
        return "android-user:" + (uid / PER_USER_RANGE);
    }
}
