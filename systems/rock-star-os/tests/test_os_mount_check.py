from pathlib import Path
import subprocess
import unittest

LIBRARY = Path(__file__).resolve().parents[1] / 'os/system/mount-check-lib.sh'


class MountCheck(unittest.TestCase):
    def matches(self, table, point='/data', source='/dev/vdb', kind='ext4', options='rw,nosuid,nodev,noexec'):
        result = subprocess.run(['sh','-c','. "$1"; rock_mount_matches "$2" "$3" "$4" "$5"',
                                 'mount-check-test',str(LIBRARY),point,source,kind,options],
                                input=table, text=True, capture_output=True, timeout=3)
        self.assertEqual(result.stderr,'')
        return result.returncode == 0

    def test_exact_device_mount_type_and_all_options(self):
        good='/dev/vdb /data ext4 rw,nosuid,nodev,noexec,relatime 0 0\n'
        self.assertTrue(self.matches(good))
        for before,after in (('/dev/vdb','/dev/vdc'),('/data','/other'),('ext4','tmpfs'),
                             ('rw,','ro,'),('nosuid,',''),('nodev,',''),('noexec,','')):
            with self.subTest(after=after):
                self.assertFalse(self.matches(good.replace(before,after)))

    def test_option_boundaries_and_later_overmount_fail_closed(self):
        good='/dev/vdb /data ext4 rw,nosuid,nodev,noexec 0 0\n'
        self.assertFalse(self.matches(good.replace('noexec','noexecfake')))
        self.assertFalse(self.matches(good + 'tmpfs /data tmpfs rw 0 0\n'))
        self.assertTrue(self.matches('tmpfs /data tmpfs rw 0 0\n' + good))

    def test_readonly_root_allows_the_selected_ab_slot_device(self):
        self.assertTrue(self.matches('/dev/loop0 / ext4 ro,relatime 0 0\n','/','-','ext4','ro'))
        self.assertFalse(self.matches('/dev/loop0 / ext4 rw,relatime 0 0\n','/','-','ext4','ro'))
        self.assertFalse(self.matches('','/','-','ext4','ro'))


if __name__ == '__main__':
    unittest.main()
